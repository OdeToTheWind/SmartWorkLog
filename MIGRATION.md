# Smart WorkLog AI — Migration Guide (Emergent → Your Own Server)

How to move the complete deployment off Emergent's hosting onto any VPS / cloud provider (DigitalOcean, AWS, Hetzner, Linode, etc.). End-to-end: **~1–2 hours** including domain DNS propagation.

> Smart WorkLog has **no Emergent-specific runtime dependencies** in the application code. Only three things need replacing: the **MongoDB instance**, the **object-storage layer** (Emergent's S3-compatible bucket), and the **public domain**. Everything else is plain FastAPI + React + MongoDB.

---

## TL;DR — what changes vs. what stays

| Component                | On Emergent                          | On your own server                                          |
| ------------------------ | ------------------------------------ | ----------------------------------------------------------- |
| Backend (FastAPI)        | Auto-managed by `supervisord`        | Run with `systemd` + `gunicorn` or `uvicorn` + `nginx`      |
| Frontend (React)         | Auto-built and served at root        | Build once with `yarn build` → serve `build/` via nginx     |
| Database                 | MongoDB managed by Emergent          | MongoDB Atlas (free tier OK) **or** self-hosted on same VM  |
| File storage             | `EMERGENT_LLM_KEY` S3-compatible API | Direct AWS S3 / Backblaze B2 / Wasabi + `boto3`             |
| AI (Gemini)              | Direct Google API (no change)        | **No change** — uses your `GEMINI_API_KEY` directly         |
| Telegram bot             | Webhook to backend (no change)       | **No change** — backend auto-registers on startup           |
| Make.com cron            | External, hits your URL (no change)  | **No change** — point Make at the new URL                   |
| HTTPS / TLS              | Emergent managed                     | Let's Encrypt via Caddy / Nginx / Traefik                   |
| Domain                   | `*.emergent.host` (Emergent owned)   | Your domain (e.g. `worklog.yourcompany.com`)                |

---

## Phase 0 — Pre-migration checklist (do this BEFORE touching anything)

- [ ] **Backup MongoDB** from Emergent:
  ```bash
  # On Emergent shell (find via the deployed app's web terminal):
  mongodump --uri="$MONGO_URL" --db=test_database --archive=/tmp/worklog-backup.gz --gzip
  ```
  Download the archive to your laptop.

- [ ] **Save `/app/backend/.env`** — open the file, copy the entire contents to a password manager. You'll paste it on the new server. The file is also in `KEYS_AND_ENV.md`.

- [ ] **Note current Emergent URLs** — they appear in:
  - Telegram BotFather setup (webhook URL — will need re-pointing)
  - Make.com scenario webhook URLs (need re-pointing)
  - Jira Developer Console (callback URL — will need updating)
  - Atlassian assetlinks.json (only if you signed an APK against the Emergent SHA-256)

- [ ] **Provision the destination server**: any VPS with ≥ 2 vCPU / 4 GB RAM / 40 GB disk, Ubuntu 22.04 LTS recommended.

- [ ] **Provision a domain** pointing to that VPS (A record → server's public IP).

---

## Phase 1 — Spin up the new server (~20 min)

```bash
# As root on the new Ubuntu 22.04 VM
apt update && apt upgrade -y
apt install -y nginx certbot python3-certbot-nginx git supervisor python3-venv python3-pip curl ca-certificates gnupg

# Node 20 LTS (for the frontend build only)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm i -g yarn

# MongoDB 7.0 (self-hosted; skip if using MongoDB Atlas)
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" \
  | tee /etc/apt/sources.list.d/mongodb-org-7.0.list
apt update && apt install -y mongodb-org
systemctl enable --now mongod
```

---

## Phase 2 — Restore the data (~5 min)

```bash
# Upload your backup, then restore
scp ~/Downloads/worklog-backup.gz root@your-server:/tmp/

# On the server
mongorestore --uri="mongodb://localhost:27017" --gzip --archive=/tmp/worklog-backup.gz
```

Verify:
```bash
mongosh
> use test_database
> db.users.countDocuments()    // should match your old user count
> exit
```

---

## Phase 3 — Deploy the code (~15 min)

```bash
# Get the code (Save-to-GitHub from Emergent if you haven't already, or scp from your laptop)
cd /opt && git clone https://github.com/<your-org>/smart-worklog.git
cd smart-worklog

# Backend
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
deactivate

# Paste your .env (use the template from KEYS_AND_ENV.md)
nano backend/.env
# IMPORTANT — update PUBLIC_BASE_URL to your new domain, e.g.:
#   PUBLIC_BASE_URL=https://worklog.yourcompany.com

# Frontend build
cd ../frontend
nano .env
# Set: REACT_APP_BACKEND_URL=https://worklog.yourcompany.com
yarn install --frozen-lockfile
yarn build
# Outputs to: /opt/smart-worklog/frontend/build/
```

---

## Phase 4 — Process management with supervisord (~5 min)

Create `/etc/supervisor/conf.d/worklog.conf`:

```ini
[program:worklog-backend]
command=/opt/smart-worklog/backend/venv/bin/uvicorn server:app --host 0.0.0.0 --port 8001 --workers 2
directory=/opt/smart-worklog/backend
autostart=true
autorestart=true
stdout_logfile=/var/log/worklog/backend.log
stderr_logfile=/var/log/worklog/backend.err.log
environment=PATH="/opt/smart-worklog/backend/venv/bin"
```

```bash
mkdir -p /var/log/worklog
supervisorctl reread && supervisorctl update
supervisorctl status worklog-backend         # should show RUNNING
```

---

## Phase 5 — Nginx reverse proxy + HTTPS (~15 min)

Create `/etc/nginx/sites-available/worklog`:

```nginx
server {
    listen 80;
    server_name worklog.yourcompany.com;

    root /opt/smart-worklog/frontend/build;
    index index.html;

    # Backend API (everything under /api → port 8001)
    location /api/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        client_max_body_size 50M;          # for file uploads
    }

    # Service worker — must not be cached
    location = /sw.js {
        add_header Cache-Control "no-cache, must-revalidate";
        try_files $uri =404;
    }

    # Static hashed bundles — long cache
    location /static/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # SPA fallback — everything else returns index.html (no-cache)
    location / {
        add_header Cache-Control "no-cache" always;
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/worklog /etc/nginx/sites-enabled/
nginx -t                                        # syntax check
systemctl reload nginx
certbot --nginx -d worklog.yourcompany.com     # auto-provisions HTTPS
```

---

## Phase 6 — Re-point external services (~10 min)

### Telegram bot
The backend auto-registers the webhook on every restart, so just restart it:
```bash
supervisorctl restart worklog-backend
# Then verify in logs:
tail -f /var/log/worklog/backend.err.log
# You should see: "Telegram webhook set → https://worklog.yourcompany.com/api/telegram/webhook"
```

### Make.com scenarios
- Open each Make scenario that calls the backend.
- Replace the Emergent URL (`https://task-intelligence-13.emergent.host/api/cron/...`) with your new URL.
- Save → enable scenario.

### Object storage (if you don't keep `EMERGENT_LLM_KEY`)
The attachment uploader uses Emergent's S3-compatible API via `EMERGENT_LLM_KEY`. To move to your own S3:
1. Create an AWS S3 bucket (or Backblaze B2 / Wasabi — they're S3-compatible too)
2. Generate access keys for an IAM user with `s3:PutObject` + `s3:GetObject` on that bucket
3. Add to `backend/.env`:
   ```
   AWS_ACCESS_KEY_ID=...
   AWS_SECRET_ACCESS_KEY=...
   AWS_S3_BUCKET=worklog-attachments
   AWS_S3_REGION=us-east-1
   ```
4. Replace the Emergent storage section in `backend/server.py` with a `boto3.client("s3")` initialization — the SDK calls are identical.

---

## Phase 7 — Verify (~5 min)

```bash
# Public URL responds
curl -s https://worklog.yourcompany.com/api/ | jq    # → {"app": "Smart WorkLog AI", "ok": true}

# Login works with existing credentials
curl -s -X POST https://worklog.yourcompany.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@acme.com","password":"pass1234"}' | jq

# Open the app in a browser → log in → check Dashboard / Tasks / People
# Service worker auto-updates within ~30s; if not, DevTools → Application → Service Workers → Unregister, then hard-refresh
```

---

## Phase 8 — Update the Android APK (~5 min)

If you've already distributed APKs to your team:

1. Open `/app/android/twa-manifest.json` on your laptop, change:
   ```json
   "host": "worklog.yourcompany.com",
   "fullScopeUrl": "https://worklog.yourcompany.com/",
   "iconUrl": "https://worklog.yourcompany.com/logo512.png",
   ```
2. Bump `appVersionCode` (1 → 2)
3. Run `./build.sh` — outputs new `app-release-signed.apk`
4. Update `assetlinks.json` if the SHA-256 changed (it won't if you use the same keystore)
5. Distribute the new APK file to your team. They install over the existing one (same keystore = same signature = no uninstall needed).

---

## Phase 9 — Decommission Emergent (optional)

Once the new server is verified and team is using it:

- Emergent dashboard → your app → **Pause deployment** (keeps the data backup for ~30 days)
- After 2 weeks of stable operation on the new server: **Delete deployment**
- Save final mongodump from Emergent **before** deletion

---

## Troubleshooting common migration issues

| Symptom                                          | Cause                                            | Fix                                                                                                            |
| ------------------------------------------------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Frontend loads, API calls fail with CORS         | `CORS_ORIGINS` doesn't include new domain        | Set `CORS_ORIGINS="https://worklog.yourcompany.com"` in backend `.env`, restart backend                        |
| MIME type "text/html" for CSS/JS                 | Service worker serving stale `index.html`         | Already fixed in `sw.js` v3 (network-first). User: hard refresh / unregister SW once                            |
| Login returns 500                                 | MongoDB connection failing                       | Check `MONGO_URL`. For Atlas, ensure VPS IP is in the Atlas IP whitelist                                       |
| Telegram bot not responding                      | Old webhook still pointing at Emergent          | `curl -X POST https://api.telegram.org/bot$TOKEN/setWebhook?url=https://worklog.yourcompany.com/api/telegram/webhook` |
| Make.com scenarios silently failing              | Old webhook URLs                                  | Update each scenario's HTTP-request URL                                                                        |
| Jira "Connect" fails with `redirect_uri_mismatch`| Atlassian app still expects the old URL          | Update Callback URL in Atlassian console; users must re-connect                                                |
| Friday PDF emails missing                        | `PUBLIC_BASE_URL` still pointing at Emergent     | Update `.env` and restart backend                                                                              |
| Attachment uploads return 500                    | `EMERGENT_LLM_KEY` not valid outside Emergent    | Migrate to plain S3 (Phase 6 → Object storage section)                                                         |

---

## File-by-file: what was Emergent-specific?

| File                                     | Emergent-specific?    | What to do on migration                                                                              |
| ---------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------- |
| `/app/backend/server.py`                 | No (mostly)           | The attachment-uploader section uses `EMERGENT_LLM_KEY` — replace with plain `boto3` if not Emergent |
| `/app/backend/requirements.txt`          | Has `emergentintegrations==0.1.0` | Keep if you keep `EMERGENT_LLM_KEY`; remove if migrating to plain S3                          |
| `/app/frontend/src/**`                   | No                    | Nothing changes                                                                                      |
| `/app/frontend/.env`                     | URL hardcoded         | Update `REACT_APP_BACKEND_URL` to new domain                                                         |
| `/app/backend/.env`                      | URL + emergent key    | Update `PUBLIC_BASE_URL`; optionally drop `EMERGENT_LLM_KEY`                                         |
| Supervisor config                        | `/etc/supervisor/conf.d/` is Emergent-style | Re-create on new server (template in Phase 4)                                            |

---

## Related docs

- [`README.md`](./README.md) — full architecture
- [`KEYS_AND_ENV.md`](./KEYS_AND_ENV.md) — every secret in one file (template above)
- [`DEPLOYMENT.md`](./DEPLOYMENT.md) — Emergent-specific deployment notes
- [`PLAYSTORE_UPLOAD.md`](./PLAYSTORE_UPLOAD.md) — Android APK / Play Store
