# Smart WorkLog AI — Complete Credentials & Keys File

> 🔒 **PRIVATE — DO NOT COMMIT TO PUBLIC REPOS.** This file contains every secret needed to run the app. Keep a copy in 1Password / Bitwarden / your team's secret manager. If the file is shared externally (e.g. for a server migration), rotate all the keys afterwards.

Last updated: **February 2026** — covers website + Android APK (sideload to team).

---

## 1. Backend `.env` (drop into `/app/backend/.env`)

```env
# ─── DATABASE ───────────────────────────────────────────────────────────
MONGO_URL="mongodb://localhost:27017"
DB_NAME="test_database"

# ─── CORS ───────────────────────────────────────────────────────────────
CORS_ORIGINS="*"

# ─── AUTH ───────────────────────────────────────────────────────────────
JWT_SECRET="worklog-prod-secret-CHANGE-ON-REDEPLOY"
JWT_EXPIRY_HOURS=720

# ─── AI: Google Gemini 2.5 Flash (direct API, NOT Emergent LLM key) ─────
# Get yours at: https://aistudio.google.com/app/apikey
GEMINI_API_KEY="<paste-your-gemini-api-key>"

# ─── TELEGRAM BOT ───────────────────────────────────────────────────────
# Create bot via @BotFather → /newbot → save the HTTP API token
TELEGRAM_BOT_TOKEN="<paste-your-telegram-bot-token>"

# ─── MAKE.COM AUTOMATIONS ───────────────────────────────────────────────
# Shared secret between backend cron endpoints and Make.com scenarios
MAKE_WEBHOOK_SECRET="<random-32-char-string>"
MAKE_DIGEST_WEBHOOK_URL="<optional-make-scenario-webhook-url>"
MAKE_WEEKLY_PDF_WEBHOOK_URL="<optional-make-scenario-webhook-url>"

# ─── SCHEDULER ──────────────────────────────────────────────────────────
SCHEDULER_ENABLED=true
DIGEST_HOUR_UTC=18

# ─── PUBLIC URL ─────────────────────────────────────────────────────────
# Where users access the app — used for Telegram setWebhook + PDF URLs.
# Update on every deploy / domain change.
PUBLIC_BASE_URL="https://task-intelligence-13.preview.emergentagent.com"

# ─── EMERGENT OBJECT STORAGE (for attachments) ──────────────────────────
# This is the Universal/Emergent LLM key — covers file uploads + S3 storage
EMERGENT_LLM_KEY="<provided-by-emergent-platform-or-set-after-migration>"

# ─── JIRA INTEGRATION (optional, P1 feature) ────────────────────────────
# Set up at: https://developer.atlassian.com/console/myapps
# Create OAuth 2.0 (3LO) app → scopes: read:jira-work, read:jira-user, offline_access
# Callback URL must EXACTLY match JIRA_REDIRECT_URI below.
JIRA_CLIENT_ID=""
JIRA_CLIENT_SECRET=""
JIRA_REDIRECT_URI="https://task-intelligence-13.preview.emergentagent.com/integrations/jira/callback"
JIRA_OAUTH_STATE_SECRET="worklog-jira-state-CHANGE-ME"
```

---

## 2. Frontend `.env` (drop into `/app/frontend/.env`)

```env
REACT_APP_BACKEND_URL=https://task-intelligence-13.preview.emergentagent.com
WDS_SOCKET_PORT=443
```

> The frontend ONLY needs the backend URL. All other secrets live server-side.

---

## 3. Quick reference — where every credential is obtained

| Variable                   | Service          | Where to get it                                                                                                                            |
| -------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `MONGO_URL`, `DB_NAME`     | MongoDB          | Local: `mongodb://localhost:27017`. Production: your MongoDB Atlas / DocumentDB connection string                                          |
| `JWT_SECRET`               | self             | Generate: `openssl rand -hex 32`                                                                                                           |
| `GEMINI_API_KEY`           | Google AI Studio | https://aistudio.google.com/app/apikey → Create API key in new project                                                                     |
| `TELEGRAM_BOT_TOKEN`       | Telegram         | DM `@BotFather` → `/newbot` → choose name → save the `123456:ABC...` token                                                                 |
| `MAKE_WEBHOOK_SECRET`      | self             | Generate: `openssl rand -hex 24` — share with your Make.com scenarios                                                                      |
| `MAKE_DIGEST_WEBHOOK_URL`  | Make.com         | Make scenario → "Webhooks" module → "Add custom webhook" → copy the generated URL                                                          |
| `EMERGENT_LLM_KEY`         | Emergent         | Auto-provisioned in Emergent runtime. For non-Emergent hosting: contact Emergent support OR replace with raw AWS S3 + `boto3`              |
| `JIRA_CLIENT_ID` / SECRET  | Atlassian        | https://developer.atlassian.com/console/myapps → Create → OAuth 2.0 integration → Settings tab. See PLAYSTORE_UPLOAD.md / ENV_REFERENCE.md |

---

## 4. Default credentials seeded by the app

| Role        | Email                       | Password    | Purpose                              |
| ----------- | --------------------------- | ----------- | ------------------------------------ |
| Super Admin | `admin@acme.com`            | `pass1234`  | Default seeded admin                 |
| HR Manager  | `bhargavi.badal@gmail.com`  | `hakuna2026`| Demo HR account (auto-seeded)        |

> Change these immediately on first login via the sidebar **lock-icon → Change password**.

---

## 5. Android APK distribution (current model — NOT Play Store)

- Build the signed APK locally: `cd /app/android && ./build.sh`
- File produced: `/app/android/app-release-signed.apk` (~3–5 MB)
- Distribute via:
  - Direct download link (e.g. host on Google Drive, Dropbox, your file server)
  - WhatsApp / Slack to your team
  - QR code linking to the APK
- Team installs by:
  1. Tap APK on Android device
  2. Allow "Install from this source" the first time (Settings prompt)
  3. App icon appears on home screen — same UX as a Play Store install
- **No assetlinks.json verification needed** for sideload — but the app will show the URL bar at the top unless you also publish `assetlinks.json` (already in the repo at `/app/frontend/public/.well-known/`)
- **Updates**: ship a new APK over the old one whenever the build artifact has a higher `appVersionCode` in `/app/android/twa-manifest.json`. **For web-only changes you don't need to rebuild** — the TWA just loads the live URL.

---

## 6. Key rotation cheat sheet

| Secret                  | Effect of rotating                                                                  | Recommended frequency  |
| ----------------------- | ----------------------------------------------------------------------------------- | ---------------------- |
| `JWT_SECRET`            | All sessions invalidated → users must re-login                                      | Every 6 months         |
| `GEMINI_API_KEY`        | AI features stop until new key is set                                               | If leaked              |
| `TELEGRAM_BOT_TOKEN`    | Bot stops responding until new token is set                                         | If leaked              |
| `MAKE_WEBHOOK_SECRET`   | Make scenarios stop firing until updated on both ends                               | Every 6 months         |
| `JIRA_CLIENT_SECRET`    | Existing Jira connections continue to work; only new "Connect" actions need re-auth | If leaked              |
| `EMERGENT_LLM_KEY`      | Attachments break until new key set                                                 | Managed by Emergent    |

---

## 7. Production deployment URLs (current)

- Preview: https://task-intelligence-13.preview.emergentagent.com
- Production: https://task-intelligence-13.emergent.host

When migrating off Emergent, replace these in `PUBLIC_BASE_URL`, `REACT_APP_BACKEND_URL`, and `JIRA_REDIRECT_URI`. See `MIGRATION.md` for the full migration playbook.
