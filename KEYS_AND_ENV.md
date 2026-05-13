# Smart WorkLog AI — Complete Credentials & Keys File

> 🔒 **PRIVATE — DO NOT COMMIT TO PUBLIC REPOSITORIES.** This file contains every secret needed to run the app, with real current values. Keep a copy in 1Password / Bitwarden / your team's secret manager. If you ever share this externally (e.g. with a contractor), rotate all the keys afterwards.

Last updated: **February 2026** — covers website + Android APK distribution.

---

## 1. Backend `.env` (drop into `/app/backend/.env` verbatim)

```env
# ─── DATABASE ───────────────────────────────────────────────────────────
MONGO_URL="mongodb://localhost:27017"
DB_NAME="test_database"

# ─── CORS ───────────────────────────────────────────────────────────────
CORS_ORIGINS="*"

# ─── AUTH (rotate every 6 months — invalidates all sessions) ────────────
JWT_SECRET="smart-worklog-ai-secret-change-in-prod-9f8a7b6c5d4e3f2a1"

# ─── EMERGENT OBJECT STORAGE (for attachments) ──────────────────────────
# This is the Universal/Emergent LLM key — covers file uploads + S3 storage.
# Auto-provisioned by Emergent. If you migrate off Emergent, swap to plain
# AWS S3 + boto3 (see MIGRATION.md Phase 6 → Object storage).
EMERGENT_LLM_KEY=sk-emergent-3844d9677E35a30533

# ─── AI: Google Gemini 2.5 Flash (direct API, NOT Emergent LLM key) ─────
# Obtained from https://aistudio.google.com/app/apikey
GEMINI_API_KEY=AIzaSyBmM1ree1mHi7ZMgrff56swtOOk-ZpMBHo

# ─── TELEGRAM BOT ───────────────────────────────────────────────────────
# Token from @BotFather → /newbot → save the HTTP API token
TELEGRAM_BOT_TOKEN=8725056503:AAH_sI9P6ZnwI2Zp4YGKdPo5346_M6XkgT8

# ─── MAKE.COM AUTOMATIONS ───────────────────────────────────────────────
# Shared secret between backend cron endpoints and Make.com scenarios
MAKE_WEBHOOK_SECRET=worklog-make-secret-9f8a7b
MAKE_DIGEST_WEBHOOK_URL=https://hook.eu1.make.com/4jqth45hoihq26lbo35v9ubcj5g55ygb
MAKE_WEEKLY_PDF_WEBHOOK_URL=https://hook.eu1.make.com/9ckspuennpf6nab19att2fv14rvdw174

# ─── SCHEDULER ──────────────────────────────────────────────────────────
SCHEDULER_ENABLED=true
DIGEST_HOUR_UTC=18

# ─── PUBLIC URL ─────────────────────────────────────────────────────────
# Where users access the app — used for Telegram setWebhook + PDF URLs.
# Update on every deploy / domain change.
PUBLIC_BASE_URL=https://task-intelligence-13.preview.emergentagent.com
# After production redeploy, set this to: https://task-intelligence-13.emergent.host
```

---

## 2. Frontend `.env` (drop into `/app/frontend/.env` verbatim)

```env
REACT_APP_BACKEND_URL=https://task-intelligence-13.preview.emergentagent.com
WDS_SOCKET_PORT=443
ENABLE_HEALTH_CHECK=false
```

> The frontend ONLY needs the backend URL. All other secrets live server-side.

For production, change to:
```env
REACT_APP_BACKEND_URL=https://task-intelligence-13.emergent.host
WDS_SOCKET_PORT=443
ENABLE_HEALTH_CHECK=false
```

---

## 3. Default credentials seeded by the app

| Role        | Email                       | Password    | Purpose                              |
| ----------- | --------------------------- | ----------- | ------------------------------------ |
| Super Admin | `admin@acme.com`            | `pass1234`  | Default seeded admin                 |
| HR Manager  | `bhargavi.badal@gmail.com`  | `hakuna2026`| Demo HR account (auto-seeded)        |

> **Change these immediately** on first login via the sidebar **lock-icon → Change password**.

---

## 4. Quick reference — where every credential is obtained

| Variable                       | Service          | Where to get it                                                                                                                            |
| ------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `MONGO_URL`, `DB_NAME`         | MongoDB          | Local: `mongodb://localhost:27017`. Production: MongoDB Atlas / DocumentDB connection string                                               |
| `JWT_SECRET`                   | self             | Generate with: `openssl rand -hex 32`                                                                                                      |
| `EMERGENT_LLM_KEY`             | Emergent         | Auto-provisioned in Emergent runtime. For non-Emergent hosting: contact Emergent support OR migrate to raw S3 + `boto3`                    |
| `GEMINI_API_KEY`               | Google AI Studio | https://aistudio.google.com/app/apikey → Create API key                                                                                    |
| `TELEGRAM_BOT_TOKEN`           | Telegram         | DM `@BotFather` → `/newbot` → choose name → save the `123456:ABC...` token                                                                 |
| `MAKE_WEBHOOK_SECRET`          | self             | Generate with: `openssl rand -hex 24` — share with your Make.com scenarios via HTTP header                                                  |
| `MAKE_DIGEST_WEBHOOK_URL`      | Make.com         | Make scenario → "Webhooks" → "Add custom webhook" → copy the generated URL                                                                  |
| `MAKE_WEEKLY_PDF_WEBHOOK_URL`  | Make.com         | Same as above for the Friday-PDF scenario                                                                                                  |

---

## 5. Android APK distribution (current model — direct, NOT Play Store)

- Build the signed APK locally: `cd /app/android && ./build.sh` on your laptop (needs JDK 17 + Node 18)
- File produced: `app-release-signed.apk` (~3–5 MB)
- Upload that APK to `/app/android/app-release-signed.apk` in your Emergent project (file browser)
- An in-app **gradient banner with Download APK button** then automatically appears on the Login page + on every authenticated page for every user
- Endpoint: `GET /api/download/apk` (public, no auth)
- Status endpoint: `GET /api/download/apk-status` → returns `{available, size_mb, updated_at}`
- **Updates**: bump `appVersionCode` in `/app/android/twa-manifest.json`, rebuild, replace the APK file. Banner updates instantly.

If you'd rather distribute outside the app, you can also share the APK via Google Drive / Slack / WhatsApp / QR — see `PLAYSTORE_UPLOAD.md`.

---

## 6. Key rotation cheat sheet

| Secret                  | Effect of rotating                                                                  | Recommended frequency  |
| ----------------------- | ----------------------------------------------------------------------------------- | ---------------------- |
| `JWT_SECRET`            | All sessions invalidated → users must re-login                                      | Every 6 months         |
| `GEMINI_API_KEY`        | AI features stop until new key is set                                               | If leaked              |
| `TELEGRAM_BOT_TOKEN`    | Bot stops responding until new token is set                                         | If leaked              |
| `MAKE_WEBHOOK_SECRET`   | Make scenarios stop firing until updated on both ends                               | Every 6 months         |
| `EMERGENT_LLM_KEY`      | Attachments break until new key set                                                 | Managed by Emergent    |

---

## 7. Production deployment URLs (current)

- Preview: https://task-intelligence-13.preview.emergentagent.com
- Production: https://task-intelligence-13.emergent.host

When migrating off Emergent, replace these in `PUBLIC_BASE_URL` (backend) and `REACT_APP_BACKEND_URL` (frontend). See `MIGRATION.md` for the full playbook.

---

## 8. Removed integrations

The **Jira integration** was removed in Feb 2026 per user request. The following env vars are no longer used and can be left out of the file entirely:

```env
# REMOVED — do not add these back
# JIRA_CLIENT_ID
# JIRA_CLIENT_SECRET
# JIRA_REDIRECT_URI
# JIRA_OAUTH_STATE_SECRET
```

The code is recoverable from git history if you ever want to re-enable it.
