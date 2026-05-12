# Smart WorkLog AI — Environment Variables & API Keys Reference

> ⚠ **This file contains all secrets, API keys, and webhook URLs in one place.** Keep it private. Do NOT commit this to GitHub — Emergent's GitHub push automatically excludes `.env` files and any file matching `*credentials*` or `*secret*`. If you copy this file, store it in your password manager.

---

## Backend `.env` — `/app/backend/.env`

```env
# === DATABASE ===
MONGO_URL=mongodb://localhost:27017
DB_NAME=test_database

# === CORS ===
CORS_ORIGINS=*

# === JWT (auth) ===
JWT_SECRET=smart-worklog-ai-secret-change-in-prod-9f8a7b6c5d4e3f2a1

# === AI: Google Gemini 2.5 Flash (direct Google AI Studio key) ===
GEMINI_API_KEY=AIzaSyBmM1ree1mHi7ZMgrff56swtOOk-ZpMBHo

# === Emergent managed object storage (file/photo uploads + PDF reports) ===
EMERGENT_LLM_KEY=sk-emergent-3844d9677E35a30533

# === Telegram bot (live) ===
TELEGRAM_BOT_TOKEN=8725056503:AAH_sI9P6ZnwI2Zp4YGKdPo5346_M6XkgT8

# === Make.com integration ===
MAKE_WEBHOOK_SECRET=worklog-make-secret-9f8a7b
MAKE_DIGEST_WEBHOOK_URL=https://hook.eu1.make.com/4jqth45hoihq26lbo35v9ubcj5g55ygb
MAKE_WEEKLY_PDF_WEBHOOK_URL=https://hook.eu1.make.com/9ckspuennpf6nab19att2fv14rvdw174

# === Scheduler (APScheduler in-process) ===
SCHEDULER_ENABLED=true
DIGEST_HOUR_UTC=18

# === Public base URL — used for Telegram setWebhook + PDF download URLs ===
# PREVIEW:    https://task-intelligence-13.preview.emergentagent.com
# PRODUCTION: https://task-intelligence-13.emergent.host
PUBLIC_BASE_URL=https://task-intelligence-13.preview.emergentagent.com
```

---

## Frontend `.env` — `/app/frontend/.env`

```env
# Public URL of FastAPI backend (used by axios in /app/frontend/src/lib/api.js)
# PREVIEW:    https://task-intelligence-13.preview.emergentagent.com
# PRODUCTION: https://task-intelligence-13.emergent.host
REACT_APP_BACKEND_URL=https://task-intelligence-13.preview.emergentagent.com

# Optional: disable hot-reload polling overhead on slower machines
WDS_SOCKET_PORT=443
```

---

## Test login credentials

| Account                 | Email                          | Password    | Role        | Notes                                  |
| ----------------------- | ------------------------------ | ----------- | ----------- | -------------------------------------- |
| **HR (real, demo)**     | `bhargavi.badal@gmail.com`     | `hakuna2026`| `hr`        | Company Hakuna Matata, IST timezone    |
| Super Admin (test)      | `admin@acme.com`               | `pass1234`  | `super_admin` | Test company Acme with seeded data    |

---

## Quick reference — what each key does

| Key                          | What it powers                                                                 | How to rotate                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `JWT_SECRET`                 | Signs every login token                                                        | Change → all users get logged out (must re-login)                                                      |
| `GEMINI_API_KEY`             | All AI calls (daily update parse, digest, translation, /newtask extraction)    | https://aistudio.google.com → API keys → Create / Regenerate                                           |
| `EMERGENT_LLM_KEY`           | Initialises Emergent object storage; falls back to AI if Gemini key absent     | Profile → Universal Key in Emergent dashboard                                                          |
| `TELEGRAM_BOT_TOKEN`         | `@smartworklogbot` — sending and receiving messages                            | https://t.me/BotFather → `/mybots` → API Token → Revoke                                                |
| `MAKE_WEBHOOK_SECRET`        | Authenticates incoming Make.com calls to `/api/cron/*`                         | Generate a random string; also update the URL `?secret=` in both Make.com scenarios                    |
| `MAKE_DIGEST_WEBHOOK_URL`    | Where backend POSTs the 6pm digest payload                                     | Make.com → Scenario → Webhook trigger → "Show webhook URL"                                             |
| `MAKE_WEEKLY_PDF_WEBHOOK_URL`| Where backend POSTs the Friday weekly PDF payload                              | Same as above for the second scenario                                                                  |
| `PUBLIC_BASE_URL`            | Used for Telegram setWebhook URL + file URLs inside the Friday PDF             | Update after deploy / domain change → backend will auto-register new Telegram webhook on next restart  |

---

## Telegram bot details

- **Bot username**: `@smartworklogbot`
- **Bot ID**: `8725056503`
- **Webhook URL** (auto-registered on backend startup): `<PUBLIC_BASE_URL>/api/telegram/webhook`
- **Registered slash commands** (visible in Telegram client):
  - `/tasks` — list my open tasks
  - `/newtask` — add a new task
  - `/acknowledge` — acknowledge my critical task
  - `/leave` — request leave for tomorrow
  - `/teamstatus` — supervisor: team status today
  - `/teammood` — HR: 7-day team mood
  - `/pendingleaves` — HR: pending leave requests
  - `/criticaltasks` — supervisor/HR: list critical tasks

### Manually inspect or reset the Telegram webhook
```bash
# Check current webhook
curl "https://api.telegram.org/bot8725056503:AAH_sI9P6ZnwI2Zp4YGKdPo5346_M6XkgT8/getWebhookInfo"

# Set webhook (auto-done by backend on startup if PUBLIC_BASE_URL is set)
curl -X POST "https://api.telegram.org/bot8725056503:AAH_sI9P6ZnwI2Zp4YGKdPo5346_M6XkgT8/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://task-intelligence-13.emergent.host/api/telegram/webhook"}'

# Remove webhook (puts bot back into MOCKED state)
curl -X POST "https://api.telegram.org/bot8725056503:AAH_sI9P6ZnwI2Zp4YGKdPo5346_M6XkgT8/deleteWebhook"
```

---

## Make.com webhook payloads

### Daily digest payload — POSTed to `MAKE_DIGEST_WEBHOOK_URL`
```json
{
  "type": "daily_digest",
  "company_id": "uuid",
  "company_name": "Hakuna Matata",
  "timezone": "Asia/Kolkata",
  "digest": "Our team had a productive day...",
  "hr_recipients": [
    {"name": "Bhargavi Badal", "email": "bhargavi.badal@gmail.com", "telegram_chat_id": "1028955327", "telegram_username": "@questsong"}
  ],
  "generated_at": "2026-05-12T12:30:00+00:00"
}
```

### Weekly PDF payload — POSTed to `MAKE_WEEKLY_PDF_WEBHOOK_URL`
```json
{
  "type": "weekly_pdf",
  "company_id": "uuid",
  "company_name": "Hakuna Matata",
  "file_id": "uuid",
  "file_url": "https://task-intelligence-13.emergent.host/api/files/<uuid>",
  "size_bytes": 14823,
  "stats": {"updates": 23, "tasks_done": 41, "blockers": 2, "avg_mood": 4.2},
  "hr_recipients": [...],
  "generated_at": "2026-05-15T12:30:00+00:00"
}
```

---

## Health check / sanity URLs

| Check                 | URL                                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| Backend liveness      | `https://task-intelligence-13.emergent.host/api/`                                                          |
| Frontend              | `https://task-intelligence-13.emergent.host/login`                                                         |
| Telegram bot info     | `https://api.telegram.org/bot8725056503:AAH_sI9P6ZnwI2Zp4YGKdPo5346_M6XkgT8/getMe`                         |
| Telegram webhook info | `https://api.telegram.org/bot8725056503:AAH_sI9P6ZnwI2Zp4YGKdPo5346_M6XkgT8/getWebhookInfo`                |
| Manual digest run     | `POST /api/admin/run-digest-now` (HR/super_admin auth)                                                     |

---

## Backup recommendation

Before any major change or domain rotation:

1. **MongoDB dump** (Emergent provides a "Backup" toggle on managed Mongo)
2. **Save this `ENV_REFERENCE.md`** in your password manager (1Password, Bitwarden, etc.) — NOT in the GitHub repo
3. **Document the current Make.com scenario IDs** (both webhook URLs above)

If `JWT_SECRET` changes, all existing JWTs become invalid → all users must re-login (no data loss, just session loss).
