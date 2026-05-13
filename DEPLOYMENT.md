# Smart WorkLog AI — Deployment Guide

Production-ready deployment playbook for the Emergent platform (primary) plus self-hosted Docker / VPS instructions (alternative).

**Live production**: https://task-intelligence-13.emergent.host
**Preview / dev**: https://task-intelligence-13.preview.emergentagent.com

---

## Table of contents

1. [Pre-deploy checklist](#pre-deploy-checklist)
2. [Deploying on Emergent (primary)](#deploying-on-emergent-primary)
3. [Post-deploy configuration](#post-deploy-configuration)
4. [Health checks & smoke tests](#health-checks--smoke-tests)
5. [Updating a live deployment](#updating-a-live-deployment)
6. [Rolling back](#rolling-back)
7. [Custom domain](#custom-domain)
8. [Self-hosted alternative (Docker / VPS)](#self-hosted-alternative-docker--vps)
9. [Monitoring](#monitoring)
10. [Troubleshooting](#troubleshooting)

---

## Pre-deploy checklist

Before pressing Deploy, verify:

- [ ] `/app/backend/.env` has every key from [`ENV_REFERENCE.md`](./ENV_REFERENCE.md) (no missing values)
- [ ] `/app/frontend/.env` has `REACT_APP_BACKEND_URL` set to the **public** backend URL (NOT `localhost`)
- [ ] No hardcoded URLs in source code (`grep -rn "localhost\|127.0.0.1\|http://0.0.0.0" /app/backend /app/frontend/src`)
- [ ] Backend running locally: `curl http://localhost:8001/api/` returns `{"app":"Smart WorkLog AI","ok":true}`
- [ ] Frontend builds without errors: `cd frontend && yarn build`
- [ ] No `.env` or `*credentials*` files staged for git push (Emergent excludes these automatically; verify just in case)
- [ ] `PUBLIC_BASE_URL` env value will need to be updated **after** deploy to match the new host

Optional but recommended:

- [ ] Run the deployment static check: ask the platform/agent to run `deployment_agent` and confirm `status: pass`
- [ ] Backup MongoDB if the deploy will reuse the same DB instance
- [ ] If using Jira integration: set `JIRA_CLIENT_ID`, `JIRA_CLIENT_SECRET`, `JIRA_REDIRECT_URI` in `/app/backend/.env` and update the **Callback URL** in your Atlassian Developer Console app to match the production redirect URI
- [ ] If you plan to distribute on Google Play: have the manifest, icons, and a signing keystore ready before running Bubblewrap / PWABuilder (see "Android — Play Store build" below)

---

## Deploying on Emergent (primary)

### Step 1 — Press Deploy

1. Open the project in the Emergent dashboard
2. Click **Deploy** (top-right button, near the project name)
3. Choose your deployment options:
   - Project name (forms the URL: `https://<name>.emergent.host`)
   - Region (pick closest to your users — currently auto)
4. Confirm

Emergent will:
- Build the React frontend (`yarn build` via craco)
- Containerise the FastAPI backend
- Provision a managed MongoDB and copy preview data over
- Inject every env var from `/app/backend/.env` into the production container
- Expose the app at the printed URL
- Run a health check and report **Ready** when complete

This usually takes 2–4 minutes.

### Step 2 — Confirm production URL

After deploy, the dashboard shows the live URL. For this project it's:

```
https://task-intelligence-13.emergent.host
```

Save this URL — you'll plug it into env vars and external services next.

---

## Post-deploy configuration

These four steps activate the full feature set on production. Skip any service you don't use.

### A. Update `PUBLIC_BASE_URL` env var

The backend reads `PUBLIC_BASE_URL` at startup to:
- Auto-register the Telegram webhook
- Embed file-download URLs inside the Friday weekly PDF emails

1. Emergent dashboard → your project → **Environment Variables**
2. Find `PUBLIC_BASE_URL`
3. Change value to your production URL:
   ```
   PUBLIC_BASE_URL=https://task-intelligence-13.emergent.host
   ```
4. Click **Save** → Emergent restarts the backend pod
5. Watch the logs for the line:
   ```
   Telegram webhook set → https://task-intelligence-13.emergent.host/api/telegram/webhook
   ```

### B. Verify Telegram webhook moved to production

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
```

Expected response:
```json
{
  "ok": true,
  "result": {
    "url": "https://task-intelligence-13.emergent.host/api/telegram/webhook",
    "pending_update_count": 0,
    "last_error_message": null
  }
}
```

If the URL still points at preview, restart the backend pod from the Emergent dashboard, or manually re-register:

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://task-intelligence-13.emergent.host/api/telegram/webhook"}'
```

### C. Repoint Make.com scenarios

For each of the two scenarios:

1. Make.com → open scenario → **HTTP** module → **URL** field
2. Replace the preview host with the production host. Final URLs:
   - **Daily digest** scenario:
     ```
     POST https://task-intelligence-13.emergent.host/api/cron/generate-digest?secret=<MAKE_WEBHOOK_SECRET>
     Body: {"timezone": "Asia/Kolkata"}
     ```
   - **Weekly PDF** scenario:
     ```
     POST https://task-intelligence-13.emergent.host/api/cron/generate-weekly-pdf?secret=<MAKE_WEBHOOK_SECRET>
     Body: {}
     ```
3. Save scenario → toggle to **Active**

The two **webhook receivers** (`MAKE_DIGEST_WEBHOOK_URL` and `MAKE_WEEKLY_PDF_WEBHOOK_URL`) inside the backend's env stay the same — those are URLs we POST data **to**, not from.

### D. (Optional) Update CORS if you serve the frontend from a different domain

If you front the app with a custom domain (see [§7](#custom-domain)), set:

```
CORS_ORIGINS=https://app.yourdomain.com,https://worklog.yourdomain.com
```

(comma-separated; no wildcards once you have a custom domain).

---

## Health checks & smoke tests

Run these immediately after every deploy:

### 1. Backend liveness
```bash
curl https://task-intelligence-13.emergent.host/api/
# → {"app":"Smart WorkLog AI","ok":true}
```

### 2. Login flow
1. Open `https://task-intelligence-13.emergent.host/login`
2. Sign in as Bhargavi (`bhargavi.badal@gmail.com` / `hakuna2026`)
3. Dashboard must render with stat cards + SLA widget + AI digest paragraph

### 3. AI parsing (proves Gemini key works in production)
```bash
TOKEN=$(curl -s -X POST https://task-intelligence-13.emergent.host/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"bhargavi.badal@gmail.com","password":"hakuna2026"}' \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])")

curl -s -X POST https://task-intelligence-13.emergent.host/api/daily-updates \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"raw_message":"Smoke test from production","mood_score":4}' \
  | python3 -c "import json,sys;d=json.load(sys.stdin);print('ai_reply:',d.get('ai_reply'))"
```

If `ai_reply` is a friendly sentence (not the literal "Update logged."), Gemini is wired correctly.

### 4. Telegram bot
- Open Telegram → `@smartworklogbot` → tap **Start**
- Linked users should get the welcome message
- Send `/tasks` → bot replies from production

### 5. Make.com manual trigger
- HR/Super Admin login → press the daily-digest button if you've added one, or:
  ```bash
  curl -X POST https://task-intelligence-13.emergent.host/api/admin/run-digest-now \
    -H "Authorization: Bearer $TOKEN"
  ```
- Response should be `{"digest":"...","make_pushed":true,"hr_count":1}`
- `make_pushed: true` confirms the Make.com scenario is reachable

If any check fails, see [§10 Troubleshooting](#troubleshooting).

---

## Updating a live deployment

After making code changes in the preview environment:

1. Test the change in preview first (`/preview` URL keeps the dev container)
2. From the Emergent dashboard, click **Deploy** again (incremental redeploy — only changed files are rebuilt, ~30–60 seconds)
3. Watch the **Build logs** for any error
4. Re-run the [smoke tests](#health-checks--smoke-tests) above

Env-only changes don't require a redeploy — just **Save** in Environment Variables → Emergent restarts the pod automatically.

---

## Rolling back

If a deploy breaks production:

1. Emergent dashboard → project → **Deploy history**
2. Find the last known good deploy
3. Click **Rollback** → confirm
4. ~30 seconds later production is back on the previous build
5. Investigate the bad change in preview, fix, then redeploy

**Database changes are NOT rolled back.** If a migration was applied during the bad deploy and you need to undo it, restore from MongoDB backup (Emergent's "Backup" toggle).

---

## Custom domain

1. Emergent dashboard → project → **Custom Domain** tab
2. Enter your domain (e.g. `worklog.hakunamatata.com`)
3. Emergent gives you a CNAME / TXT record to add to your DNS provider
4. Wait for DNS propagation (~5–60 minutes)
5. Update env vars to match:
   ```
   PUBLIC_BASE_URL=https://worklog.hakunamatata.com
   CORS_ORIGINS=https://worklog.hakunamatata.com
   REACT_APP_BACKEND_URL=https://worklog.hakunamatata.com
   ```
6. Re-register Telegram webhook (see [§B](#b-verify-telegram-webhook-moved-to-production))
7. Update both Make.com scenarios' URLs

Emergent handles HTTPS certificate provisioning (Let's Encrypt) automatically.

---

## Self-hosted alternative (Docker / VPS)

If you ever need to move off Emergent (BYO infra), here's the minimum recipe.

### Prerequisites
- Linux VPS with Docker + docker-compose
- MongoDB instance (managed Atlas, or self-hosted)
- Domain + HTTPS certificate (Caddy/nginx-proxy + Let's Encrypt recommended)

### Backend Dockerfile (`backend/Dockerfile`)

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8001
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001"]
```

### Frontend build + nginx (`frontend/Dockerfile`)

```dockerfile
# stage 1 — build
FROM node:18-alpine AS build
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn build

# stage 2 — serve
FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

`frontend/nginx.conf`:
```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;

  # proxy /api to backend container
  location /api/ {
    proxy_pass http://backend:8001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  # SPA fallback
  location / { try_files $uri /index.html; }
}
```

### `docker-compose.yml`

```yaml
version: "3.9"
services:
  mongo:
    image: mongo:7
    volumes: ["mongo-data:/data/db"]
    restart: unless-stopped

  backend:
    build: ./backend
    env_file: ./backend/.env
    environment:
      - MONGO_URL=mongodb://mongo:27017
      - DB_NAME=worklog
      - PUBLIC_BASE_URL=https://worklog.yourdomain.com
    depends_on: [mongo]
    restart: unless-stopped

  frontend:
    build: ./frontend
    ports: ["80:80"]
    depends_on: [backend]
    restart: unless-stopped

volumes:
  mongo-data:
```

### Bring up
```bash
docker compose up -d --build
```

### TLS / HTTPS
Front the frontend container with **Caddy** for automatic Let's Encrypt:

```caddyfile
worklog.yourdomain.com {
  reverse_proxy localhost:80
}
```

Or use **Cloudflare Tunnel** for a no-port-forwarding option.

---

## Monitoring

### Emergent built-in
- Dashboard → **Logs** tab: tail backend + frontend supervisor logs
- Dashboard → **Metrics**: CPU, memory, request rate

### Recommended add-ons (optional)
- **UptimeRobot** or **Better Stack** → hit `/api/` every 5 min, alert on 5xx
- **Sentry** → drop the React SDK in `index.js` and the Python SDK in `server.py` for error tracking
- **PostHog / Plausible** → product analytics (already loaded as PostHog in `index.html` for the preview build)

### Health endpoints you can poll
| Endpoint | Expected |
| --- | --- |
| `GET /api/` | 200 + `{"ok":true}` |
| `GET https://api.telegram.org/bot$TG_TOKEN/getMe` | 200 + bot info |
| `GET https://api.telegram.org/bot$TG_TOKEN/getWebhookInfo` | `last_error_message: null` |

---

## Troubleshooting

| Symptom                                                         | Most likely cause                                          | Fix                                                                                                |
| --------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Frontend loads, "Network Error" toast on login                  | `REACT_APP_BACKEND_URL` wrong / CORS blocked               | Check frontend env var, verify it's the production URL with `https://`; also check `CORS_ORIGINS` |
| Backend returns 401 on `/api/auth/me` immediately               | `JWT_SECRET` changed since user logged in                  | Users must re-login; otherwise pick a stable secret and don't rotate                               |
| Telegram bot replies from preview not production               | `PUBLIC_BASE_URL` not updated → webhook still points at preview | Set env var → restart pod → verify with `getWebhookInfo`                                       |
| `make_pushed: false` in admin-run-digest response               | Make.com scenario inactive, or wrong webhook URL           | Make.com → scenario → toggle Active; or `curl -X POST <webhook>` to test reachability              |
| Daily update returns `"ai_reply": "Update logged."` (no Gemini) | `GEMINI_API_KEY` missing / invalid / quota exceeded        | Check env var, regenerate at https://aistudio.google.com                                            |
| File upload returns 503 "Storage not initialised"               | `EMERGENT_LLM_KEY` empty                                   | Set the key, restart backend                                                                       |
| Scheduler not firing 18:00 UTC digest                           | `SCHEDULER_ENABLED=false` or pod restarted                 | Set `SCHEDULER_ENABLED=true`; in production prefer Make.com as the trigger anyway                  |
| HR can't see other users' leaves                                | Old token issued before role was changed to `hr`           | Log out / log in                                                                                   |
| Telegram `/start` doesn't auto-link                             | User's `telegram_username` not yet stored                  | Set username in Profile page first, then `/start` again                                            |
| 404 on `/api/files/<id>` when opened directly                   | Missing auth                                               | Add `?auth=<jwt>` query param (frontend uses this for `<img src>`)                                 |

### Reading logs

**On Emergent**:
- Dashboard → Logs → choose `backend` stream

**Self-hosted**:
```bash
docker compose logs -f backend
docker compose logs -f frontend
```

Look for:
- `Object storage initialised`
- `Scheduler started: daily digest Mon-Fri 18:00 UTC`
- `Telegram webhook set → <url>`
- `Application startup complete.`

All four should appear on a healthy boot.

---

## Quick deploy commands cheat-sheet

```bash
# Local dev
cd backend  && uvicorn server:app --reload --host 0.0.0.0 --port 8001
cd frontend && yarn install && yarn start

# Production health
curl https://task-intelligence-13.emergent.host/api/

# Manually trigger digest
TOKEN=$(curl -s -X POST https://task-intelligence-13.emergent.host/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"bhargavi.badal@gmail.com","password":"hakuna2026"}' | jq -r .token)
curl -X POST https://task-intelligence-13.emergent.host/api/admin/run-digest-now \
  -H "Authorization: Bearer $TOKEN"

# Telegram webhook check
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"

# Re-register Telegram webhook
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://task-intelligence-13.emergent.host/api/telegram/webhook"}'
```

---

## Android — Play Store build (PWA → TWA)

A pre-filled build kit is already in the repo at `/app/android/`. The full upload walkthrough (Play Developer account → AAB build → asset links → Internal Testing → tester invites) is in **[`PLAYSTORE_UPLOAD.md`](./PLAYSTORE_UPLOAD.md)**.

### TL;DR

```bash
# On your laptop (Node 18+, JDK 17 required):
cd /app/android
./build.sh
```

Bubblewrap will:
1. Auto-install itself + the Android SDK on first run
2. Prompt you for a signing keystore password (SAVE IT — Google Play cannot replace this key once published)
3. Produce `app-release-bundle.aab` (for Play Console) + `app-release-signed.apk` (for sideload)
4. Run `bubblewrap fingerprint` to get the SHA-256 → paste it into `/app/frontend/public/.well-known/assetlinks.json` → redeploy frontend
5. Upload the AAB at https://play.google.com/console → your app → Internal testing → Create new release

---

## Jira integration — post-deploy steps

If you enable the Jira integration (P1 feature), after deploy:

1. In **Atlassian Developer Console** (https://developer.atlassian.com/console/myapps), open your OAuth 2.0 app's **Authorization** tab.
2. Update **Callback URL** to the production URI: `https://task-intelligence-13.emergent.host/integrations/jira/callback`.
3. Set `JIRA_REDIRECT_URI` in `/app/backend/.env` to the exact same value.
4. `sudo supervisorctl restart backend`.
5. Visit `/integrations` in the deployed app — the "Connect Jira" button should be active. Click → Atlassian consent screen → returns and shows "Connected".
6. Click **Sync now** → assigned issues appear under **Tasks** with `external_source: jira`.

---

## Related docs

- [`README.md`](./README.md) — full architecture, API reference, RBAC matrix
- [`ENV_REFERENCE.md`](./ENV_REFERENCE.md) — all env vars + key rotation cheatsheet (private — do not commit)
- [`PLAYSTORE_UPLOAD.md`](./PLAYSTORE_UPLOAD.md) — Google Play Internal Testing upload walkthrough (build kit + step-by-step submission)
- [`memory/PRD.md`](./memory/PRD.md) — original spec + Phase 1 / Phase 2 / deferred backlog

---

## License

Proprietary — Smart WorkLog AI, built by Hakuna Matata.
