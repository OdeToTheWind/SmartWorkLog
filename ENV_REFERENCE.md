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

# === Jira OAuth (one-way external→WorkLog sync, P1) ===
# To enable: create an Atlassian OAuth 2.0 (3LO) app and paste credentials below.
# Where to get them: https://developer.atlassian.com/console/myapps → "Create" → "OAuth 2.0 integration"
#   1. In Authorization → OAuth 2.0 (3LO) → Configure → set Callback URL to JIRA_REDIRECT_URI
#   2. In Permissions → grant: read:jira-work, read:jira-user, offline_access
#   3. Copy Client ID + Secret from the Settings tab
JIRA_CLIENT_ID=
JIRA_CLIENT_SECRET=
JIRA_REDIRECT_URI=https://task-intelligence-13.preview.emergentagent.com/integrations/jira/callback
JIRA_OAUTH_STATE_SECRET=worklog-jira-oauth-state-change-me
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
| `JIRA_CLIENT_ID` / `_SECRET` | Atlassian OAuth 2.0 (3LO) — enables Jira "Connect" button on Integrations page | Atlassian Developer Console → your app → Settings (Client ID is public; Secret must be kept private)   |
| `JIRA_REDIRECT_URI`          | Where Atlassian redirects after authorization                                  | Must match the value configured in Atlassian Developer Console exactly (incl. scheme + path)           |
| `JIRA_OAUTH_STATE_SECRET`    | Reserved for future state-hash signing; safe default provided                  | Rotate any time — does not invalidate existing connections                                             |

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

---

## Jira integration — step-by-step setup

The backend exposes `/api/integrations/jira/{status,auth-url,callback,sync,disconnect}` and the frontend shows a "Connect Jira" card on **/integrations** for `developer`, `supervisor`, `hr`, `super_admin` roles. Until you set the env vars below, the card shows a "Jira not configured" warning.

1. Visit https://developer.atlassian.com/console/myapps and click **Create → OAuth 2.0 integration**.
2. In **Authorization → OAuth 2.0 (3LO) → Configure**, set **Callback URL** to `<PUBLIC_BASE_URL>/integrations/jira/callback` (use your production or preview URL — they must match exactly).
3. In **Permissions**, add the **Jira API** product, then grant scopes: `read:jira-work`, `read:jira-user`, `offline_access`.
4. In **Settings**, copy **Client ID** and **Secret**.
5. Paste them into `backend/.env`:
   ```env
   JIRA_CLIENT_ID=<your client id>
   JIRA_CLIENT_SECRET=<your client secret>
   JIRA_REDIRECT_URI=https://task-intelligence-13.emergent.host/integrations/jira/callback
   ```
6. `sudo supervisorctl restart backend` to pick up the new env vars.
7. Users with role `developer` (and above) will then see an active **Connect Jira** button on **/integrations**.

**What gets synced:** Each "Sync now" click fetches up to 200 of the user's unfinished Jira issues (`assignee = currentUser() AND statusCategory != Done`) and mirrors them as **technical** tasks in WorkLog. Jira priorities map as: Highest→Critical, High→High, Medium→Medium, Low/Lowest→Low. Status maps: New→todo, In Progress→in_progress, Done→done. Synced tasks carry `external_source: "jira"`, `external_id: "jira:KEY-123"`, and `external_url` linking back to the Jira issue. **Jira remains the source of truth** — local edits will be overwritten on next sync.

---

## Android — install as a native-feel app (PWA)

The web app is a **fully installable Progressive Web App** (PWA). On Android (Chrome, Edge, Samsung Internet, Brave, Opera):

1. Visit `<PUBLIC_BASE_URL>` in a mobile browser.
2. Sign in (or use the in-app **Install** banner that appears automatically — bottom-right).
3. Tap browser menu (⋮) → **Install app** / **Add to Home screen**.
4. The app launches in **standalone mode** (no browser chrome), has its own icon, splash screen, and full offline shell.

### Generate a real APK / Play Store build (optional)

Use either **PWABuilder** (web GUI, fastest) or **Bubblewrap** (Google's CLI):

```bash
# Option A: PWABuilder web UI
open https://www.pwabuilder.com/   # paste your PUBLIC_BASE_URL, click "Build" → "Android"

# Option B: Bubblewrap CLI (creates a signed APK/AAB locally)
npm i -g @bubblewrap/cli
bubblewrap init --manifest=https://task-intelligence-13.emergent.host/manifest.json
bubblewrap build      # produces app-release-signed.apk + app-release-bundle.aab
```

Both wrap the PWA in a **Trusted Web Activity (TWA)** — Google Play accepts these as native apps. You only need to update the wrapper if `manifest.json` changes substantially.

---

## Dark / Light mode

Built-in three-way toggle (System → Light → Dark) in the sidebar footer (sun/moon/desktop icon). Honors `prefers-color-scheme`, persists choice in `localStorage` under `worklog_theme`. Tokens — light: shadcn defaults; dark: `bg-zinc-950` / `text-zinc-50` / `border-zinc-800`. AI-driven CTAs use the `ai-gradient` class (indigo → purple → pink) so AI actions are visually distinguished from regular actions.
