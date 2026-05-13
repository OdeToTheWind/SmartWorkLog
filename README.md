# Smart WorkLog AI

> **AI-powered workforce daily-update and task management system, available as a Website AND an Android APK.**

[![status](https://img.shields.io/badge/status-production-success)]() [![stack](https://img.shields.io/badge/stack-FastAPI%20%2B%20React%20%2B%20MongoDB-2563eb)]() [![ai](https://img.shields.io/badge/AI-Gemini%202.5%20Flash-7c3aed)]() [![pwa](https://img.shields.io/badge/PWA-Android%20Ready-10b981)]()

---

## Table of Contents

1. [What it is](#what-it-is)
2. [Two ways to use it](#two-ways-to-use-it)
3. [Feature list](#feature-list)
4. [Architecture](#architecture)
5. [Tech stack](#tech-stack)
6. [Six roles & RBAC](#six-roles--rbac)
7. [API reference](#api-reference)
8. [AI behaviour](#ai-behaviour)
9. [Light / Dark mode](#light--dark-mode)
10. [Telegram bot](#telegram-bot)
11. [Make.com automations](#makecom-automations)
12. [Jira integration](#jira-integration)
13. [PWA + Android APK distribution](#pwa--android-apk-distribution)
14. [Local development](#local-development)
15. [Environment & keys](#environment--keys)
16. [Migrating off Emergent](#migrating-off-emergent)
17. [Related docs](#related-docs)

---

## What it is

Smart WorkLog AI is a **multi-tenant SaaS** that lets distributed teams submit free-text daily updates which **Gemini 2.5 Flash** parses into structured data (mood, summary, blockers, urgency). Managers see real-time dashboards; HR gets weekly PDFs; supervisors get escalation alerts on critical-priority tasks. The same workflows are accessible via:

- **Web app** at `https://task-intelligence-13.emergent.host` (responsive, PWA, light/dark mode)
- **Android app** — signed APK distributed directly to your team (no Play Store needed)
- **Telegram bot** — two-way, lets users post updates, create tasks, request leave, query team status from chat

It runs entirely on the Emergent stack but is **portable** — see [`MIGRATION.md`](./MIGRATION.md).

---

## Two ways to use it

### 1) The Website (Primary)

Open the URL in any modern browser:
- Live: https://task-intelligence-13.emergent.host
- Preview / dev: https://task-intelligence-13.preview.emergentagent.com

Default seeded credentials (change on first login):
- **Super Admin** — `admin@acme.com` / `pass1234`
- **HR Manager** — `bhargavi.badal@gmail.com` / `hakuna2026`

### 2) The Android App (Internal Distribution)

Smart WorkLog is also packaged as a **signed Android APK** (`/app/android/app-release-signed.apk`). You distribute it **directly to your team** (not via Google Play) using:

- Direct download link (Google Drive, Dropbox, your file server)
- WhatsApp / Slack / email attachment
- QR code

Team members install by tapping the APK, allowing "Install from this source" once, and the app icon appears on their home screen with the same look + feel as a Play Store app. Updates are pushed by sending a new APK with a higher `appVersionCode`. The build kit (`/app/android/`) and one-command build script (`./build.sh`) are in this repo. **For pure web/UI changes you don't need to rebuild** — the APK is a TWA wrapper that loads the live URL.

Full APK build + distribution guide: [`PLAYSTORE_UPLOAD.md`](./PLAYSTORE_UPLOAD.md) (the Play-Store section is optional — feel free to ignore it and stay on direct distribution).

---

## Feature list

### Core
- **6-role RBAC**: Super Admin > HR Manager > Supervisor > Developer > Team Member > Employee
- **Multi-tenant data isolation** — every record scoped to `company_id` (queryable only by the same tenant)
- **JWT-based auth** — 30-day token, bcrypt password hashing
- **5 role-specific dashboards** — each shows what *that* role actually cares about

### Daily updates & AI
- Free-text submission (web or Telegram)
- Gemini 2.5 Flash extracts: mood (1-5), one-line AI summary, blocker detection, language detection
- Mood heatmap (Recharts) per team
- 14-day streak counter + badges (gamification)

### Tasks
- Personal / Team / Recurring task types
- Priority escalation flow — must give a reason + "sacrifice" when bumping a task to *critical*
- Three views: **Table**, **Kanban**, **Grid**
- Attachments via Emergent object storage (10 MB each)

### People & Teams
- **Self-service password change** (lock icon in sidebar) — required current password, strength meter
- **Self-service email change** (envelope icon in sidebar) — re-issues JWT in-place
- **Bulk CSV import** of up to 500 people (HR/Super Admin only) — auto-creates missing teams, resolves supervisors by email, generates temp passwords
- **GDPR right-to-delete** — HR can purge any user with audit trail

### Communications
- **Two-way Telegram bot** — `/start` auto-links account, then post daily updates, create tasks with `/newtask`, request leave, ask AI questions in 7 languages
- **In-app notifications** with do-not-disturb / quiet hours
- **Make.com automations** — Daily Digest at 18:00 IST + Friday Weekly PDF report

### Polish
- **Light / Dark mode** with system-preference detection (zinc-950 / zinc-50 / zinc-800 dark palette)
- **AI-distinct CTAs** — Gemini-powered buttons use a signature indigo→purple→pink gradient
- **7-language i18n** with RTL for Arabic/Urdu
- **PWA** — installable on Android, offline-capable, dark-mode aware status bar
- **Audit log** — every state change recorded with `who/what/when/why`
- **Weekly leaderboard** — streaks, points, badges

---

## Architecture

```
                    ┌──────────────────────────────────────────────────────┐
                    │           Smart WorkLog AI — Single-tenant deploy    │
                    └──────────────────────────────────────────────────────┘

   ┌──────────────┐                                              ┌────────────────────┐
   │ Web (React)  │  ◄─────────  HTTPS  ───────────────────►     │   FastAPI Backend  │
   │ + PWA + APK  │              JWT                              │   (Python 3.11)    │
   └──────────────┘                                              └────────┬───────────┘
                                                                          │
                       ┌──────────────────────────────────────┬───────────┼───────────┬─────────────────┐
                       ▼                                      ▼           ▼           ▼                 ▼
                ┌───────────┐                          ┌─────────────┐  ┌───────┐ ┌──────────┐   ┌─────────────┐
                │ MongoDB    │                          │ Gemini 2.5  │  │ Telegram │ │ Make.com │   │ Emergent S3 │
                │ (multi-    │                          │ Flash       │  │ Bot API │ │ Webhooks │   │ (object     │
                │  tenant)   │                          │ (Google)    │  │         │ │          │   │  storage)   │
                └───────────┘                          └─────────────┘  └───────┘ └──────────┘   └─────────────┘
```

- **Multi-tenancy**: every collection has a `company_id` field; all queries automatically filter by the JWT's company_id claim
- **AI**: direct `google-genai` SDK call to Google's Gemini 2.5 Flash with the user's `GEMINI_API_KEY` (NOT the Emergent LLM key — explicit user requirement)
- **Object storage**: attachments hit Emergent's S3-compatible API via `EMERGENT_LLM_KEY` (when running on Emergent). On a migrated deployment, swap to plain `boto3` + AWS S3 / Backblaze B2 (see `MIGRATION.md`)

---

## Tech stack

| Layer        | Technology                                                   |
| ------------ | ------------------------------------------------------------ |
| Frontend     | React 18 + Tailwind CSS + shadcn/ui + Phosphor Icons + Recharts |
| State / data | Axios + React Router + React Context                         |
| Backend      | FastAPI 0.110 + Pydantic + Motor (async MongoDB driver)      |
| Database     | MongoDB 7                                                    |
| AI           | **Gemini 2.5 Flash** via `google-genai` SDK 2.0.1            |
| Auth         | PyJWT + bcrypt                                               |
| Scheduling   | APScheduler (in-process)                                     |
| Telegram     | `python-telegram-bot` via plain HTTPS webhook                |
| File storage | Emergent S3-compatible (via `EMERGENT_LLM_KEY`)              |
| PDF          | ReportLab                                                    |
| Android      | Bubblewrap (TWA wrapper around the PWA)                      |
| Hosting      | Emergent platform (managed supervisord + nginx)              |

---

## Six roles & RBAC

| Role          | Sees on Dashboard                          | Can create tasks    | Can manage people    | Can purge users | Sees audit log |
| ------------- | ------------------------------------------ | -------------------- | -------------------- | --------------- | -------------- |
| Super Admin   | Cross-company overview, integrations       | Yes (any)            | Yes (incl. other admins) | Yes         | Yes (full)     |
| HR Manager    | Company health, leaderboard, SLA widget    | Yes                  | Yes                  | Yes             | Yes            |
| Supervisor    | Team kanban + team mood                    | Yes (team only)      | Edit team members    | No              | Team only      |
| Developer     | Personal kanban + integrations             | Yes (own)            | No                   | No              | Own only       |
| Team Member   | Personal task list                         | Yes (own)            | No                   | No              | Own only       |
| Employee      | Personal task list                         | Yes (own)            | No                   | No              | Own only       |

All API endpoints enforce these rules server-side. Front-end nav items are filtered by role too.

---

## API reference

A condensed view. Every endpoint is under `/api/` and (except auth) requires `Authorization: Bearer <jwt>`.

### Auth
| Method | Path                          | Description                                            |
| ------ | ----------------------------- | ------------------------------------------------------ |
| POST   | `/auth/register-company`      | Create company + super admin in one step               |
| POST   | `/auth/login`                 | Returns `{token, user}`                                |
| GET    | `/auth/me`                    | Current user (without password hash)                   |
| POST   | `/auth/change-password`       | `{current_password, new_password}` — 8 char min        |
| POST   | `/auth/change-email`          | `{current_password, new_email}` — re-issues JWT        |

### Users & Teams
| Method | Path                              | Roles            | Notes                                                  |
| ------ | --------------------------------- | ---------------- | ------------------------------------------------------ |
| POST   | `/users`                          | super_admin, hr  | Create user                                            |
| POST   | `/users/bulk-import`              | super_admin, hr  | CSV bulk import (up to 500 rows)                       |
| GET    | `/users`                          | all              | Scoped list (supervisor sees own team)                 |
| PATCH  | `/users/me`                       | all              | Update own timezone, language, Telegram handle, prefs  |
| DELETE | `/users/{id}/purge`               | hr, super_admin  | GDPR purge — needs `{"confirmation_text": "DELETE PERMANENTLY"}` |
| POST   | `/teams`                          | super_admin, hr  | Create team                                            |
| GET    | `/teams`                          | all              | List teams                                             |

### Tasks
| Method | Path                              | Description                                                                 |
| ------ | --------------------------------- | --------------------------------------------------------------------------- |
| POST   | `/tasks`                          | Create personal / team / recurring task                                     |
| GET    | `/tasks?status=&assignee=&team=`  | Filterable list                                                             |
| PATCH  | `/tasks/{id}`                     | Update fields (priority bump requires `reason` + `sacrifice`)              |
| DELETE | `/tasks/{id}`                     | Soft archive                                                                |

### Daily updates
| Method | Path                              | Description                                                                 |
| ------ | --------------------------------- | --------------------------------------------------------------------------- |
| POST   | `/daily-updates`                  | Submit raw text + mood → AI parses it inline, returns summary + streak     |
| GET    | `/daily-updates?date=`            | History (filtered by date, user)                                            |

### Leave & notifications
| Method | Path                              | Description                                                                 |
| ------ | --------------------------------- | --------------------------------------------------------------------------- |
| POST   | `/leave-requests`                 | Submit leave request                                                        |
| POST   | `/leave-requests/{id}/decision`   | HR / Supervisor approve or reject                                           |
| GET    | `/notifications`                  | In-app inbox                                                                |

### Admin & cron
| Method | Path                              | Description                                                                 |
| ------ | --------------------------------- | --------------------------------------------------------------------------- |
| POST   | `/admin/run-digest-now`           | Manual daily digest fire (hr/super_admin)                                   |
| POST   | `/admin/run-weekly-pdf-now`       | Manual Friday-PDF fire                                                      |
| POST   | `/cron/generate-digest`           | Called by Make.com on schedule (uses `MAKE_WEBHOOK_SECRET`)                 |
| POST   | `/cron/generate-weekly-pdf`       | Called by Make.com on schedule                                              |
| POST   | `/telegram/webhook`               | Inbound Telegram bot updates                                                |

### APK distribution (temporary, internal testing)
| Method | Path                              | Description                                                                 |
| ------ | --------------------------------- | --------------------------------------------------------------------------- |
| GET    | `/download/apk-status`            | Public — returns `{available, size_bytes, size_mb, updated_at}`              |
| GET    | `/download/apk`                   | Public — serves `app-release-signed.apk` if present, 404 otherwise          |

Frontend banner (`ApkDownloadBanner`) auto-shows on Login + every authenticated page when the APK file is uploaded to `/app/android/app-release-signed.apk`. Remove this facility once distribution moves to a permanent channel (Drive link, Play Store, MDM).

Full API documentation with request/response examples lives in the codebase at `/app/backend/server.py` (search for `@api.`).

---

## AI behaviour

**Model**: `gemini-2.5-flash` via `google-genai` SDK (direct Google API, not Emergent LLM key).

What the AI does:
1. **Parse daily updates** — extracts mood score, one-line summary, blocker mentions
2. **Parse Telegram messages** — converts free text like "remind me to ship the auth fix by Friday, high priority" into a structured task
3. **Translate replies** — bot replies in the user's preferred language (7 supported)
4. **Auto-detect blockers** — flags blockers in updates for supervisor notification

System prompts are deliberately strict and JSON-shaped where structured output is needed (mood parsing, task creation), and natural-language elsewhere (chat replies). All AI calls live in `_gemini_call()` in `server.py`.

If `GEMINI_API_KEY` is empty or the call fails, the app gracefully degrades — daily updates save as raw text without an AI summary, and the bot replies with an echo. No feature *requires* AI to function.

---

## Light / Dark mode

Three-state toggle via the sidebar footer icon (sun/moon/desktop):

- **System** (default) — honors `prefers-color-scheme`
- **Light** — shadcn defaults
- **Dark** — `bg-zinc-950` / `text-zinc-50` / `border-zinc-800`

Preference persisted in `localStorage.worklog_theme`. Status-bar meta tags also flip for true edge-to-edge dark display on Android. AI-driven buttons (Daily Update parse, Jira sync, PWA install banner) always use the **indigo → purple → pink** signature gradient (via the `ai-gradient` utility class) regardless of theme — so AI actions are visually distinct from regular CTAs.

---

## Telegram bot

After setting `TELEGRAM_BOT_TOKEN`, the backend auto-registers the webhook at startup. Users link their account by DM'ing `/start <email>` (or `/start` if their phone number is on file).

Commands:
| Command       | What it does                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------- |
| `/start`      | Link Telegram chat to user account                                                           |
| `/today`      | Submit today's daily update (free text afterward → AI parses)                                |
| `/newtask`    | Natural language → structured task ("ship auth fix by Friday high priority")                 |
| `/leave`      | Request leave (`/leave 2026-03-04 to 2026-03-05 family wedding`)                             |
| `/status`     | Get a 1-line summary of your team's day (supervisor only)                                    |
| `/help`       | Command list                                                                                 |

All replies are auto-translated to the user's preferred language.

---

## Make.com automations

Two scenarios, both **scheduled in Make** (not in the backend), both authenticated via `MAKE_WEBHOOK_SECRET`:

1. **Daily Digest** — Mon–Fri 18:00 IST → calls `/api/cron/generate-digest` for each company → backend produces a per-team summary → Make routes it to email / Slack / wherever
2. **Friday Weekly PDF** — Friday 18:05 IST → calls `/api/cron/generate-weekly-pdf` → backend builds a ReportLab PDF with the week's stats → returns a public URL → Make emails it to HR

The backend also has an in-process **APScheduler** fallback that runs the same cron jobs locally if `SCHEDULER_ENABLED=true` — useful when Make.com isn't configured.

---

## Jira integration

> **Removed in February 2026 per user request.** All `/api/integrations/jira/*` routes, the `JIRA_*` env vars, the Integrations page, and the sidebar nav entry have been removed. The code is recoverable from git history if you ever want to re-enable it.

---

## PWA + Android APK distribution

### Web → PWA installation (any role)

On Chrome / Edge / Samsung Internet / Brave on Android:
1. Open the URL → an in-app gradient banner appears at bottom-right ("Install Smart WorkLog")
2. Tap **Install** → app icon appears on home screen
3. Tap the icon → opens fullscreen, no browser chrome (`display: standalone`)

On iOS Safari → Share → "Add to Home Screen" (no auto-prompt — iOS limitation).

### Android APK (current distribution model)

Smart WorkLog is also wrapped as a signed Android APK using **Bubblewrap** (Google's official TWA tool). You distribute the APK directly to your team — **no Google Play account needed**.

The build kit is in `/app/android/`:
```
twa-manifest.json   # Bubblewrap config — pre-filled for Smart WorkLog
build.sh            # One-command AAB + APK build script
```

**Build on your laptop** (requires JDK 17 + Node 18+):
```bash
cd /app/android
./build.sh
# Output:
#   app-release-signed.apk     ← send this to your team
#   android.keystore           ← KEEP THIS FOREVER (re-used for every update)
```

**Distribute** by:
- Hosting the APK on Google Drive / Dropbox / your file server → share the link
- WhatsApp / Slack the file directly
- QR code that links to the APK
- An optional `assetlinks.json` is already in `/app/frontend/public/.well-known/` — paste your SHA-256 fingerprint there if you want the address-bar hidden in fullscreen mode

**Update** by bumping `appVersionCode` in `twa-manifest.json`, re-running `./build.sh`, and re-sending the new APK. Users install over the old one (same keystore = no uninstall needed). **Web-only changes don't need a new APK** — the TWA loads the live URL.

Detailed guide: [`PLAYSTORE_UPLOAD.md`](./PLAYSTORE_UPLOAD.md) (the Play Store-specific sections are optional).

---

## Local development

### Prerequisites
- Python 3.11
- Node 20 + Yarn
- MongoDB 7 (local or Atlas)

### Backend
```bash
cd /app/backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp ../KEYS_AND_ENV.md .env   # then edit to keep only the .env block
uvicorn server:app --reload --host 0.0.0.0 --port 8001
```

### Frontend
```bash
cd /app/frontend
yarn install
# Edit .env → REACT_APP_BACKEND_URL=http://localhost:8001
yarn start
```

On Emergent the supervisor restarts both automatically on file change. On your own machine, hot-reload is enabled for both.

---

## Environment & keys

**All secrets in one file**: [`KEYS_AND_ENV.md`](./KEYS_AND_ENV.md)
**Reference + key rotation guide**: [`ENV_REFERENCE.md`](./ENV_REFERENCE.md)

Quick env recap:

| File                         | Required keys                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `/app/backend/.env`          | `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `MAKE_WEBHOOK_SECRET`, `PUBLIC_BASE_URL`, …      |
| `/app/frontend/.env`         | `REACT_APP_BACKEND_URL`                                                                                                        |
| `/app/android/twa-manifest.json` | `host`, `fullScopeUrl`, `iconUrl` — for the APK build                                                                       |

---

## Migrating off Emergent

Smart WorkLog has **no Emergent-specific runtime dependencies** — only the optional `EMERGENT_LLM_KEY` for attachment storage uses an Emergent API. Everything else is plain FastAPI + React + MongoDB and runs anywhere.

Full step-by-step migration playbook: [`MIGRATION.md`](./MIGRATION.md)

TL;DR migration:
1. Provision a VPS (Ubuntu 22.04, ≥2 vCPU / 4 GB / 40 GB)
2. Install Node 20 + Python 3.11 + MongoDB 7 + nginx + certbot
3. `mongodump` from Emergent → `mongorestore` on the new VM
4. Clone the repo, paste env, `yarn build`, supervisor + nginx config
5. `certbot --nginx -d worklog.yourcompany.com` for free HTTPS
6. Re-point Telegram webhook + Make.com scenarios + Jira callback URL
7. Rebuild the Android APK with the new domain, re-distribute to team

ETA: **~1–2 hours**, including DNS propagation.

---

## Related docs

| Doc                                            | Purpose                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| [`KEYS_AND_ENV.md`](./KEYS_AND_ENV.md)         | Every secret + where to obtain it, in one private file (do not commit)   |
| [`ENV_REFERENCE.md`](./ENV_REFERENCE.md)       | Per-variable reference + key rotation guide                              |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md)             | Emergent-specific deployment notes + preview/production split            |
| [`MIGRATION.md`](./MIGRATION.md)               | Step-by-step Emergent → self-hosted server playbook                      |
| [`PLAYSTORE_UPLOAD.md`](./PLAYSTORE_UPLOAD.md) | Android APK build kit + optional Play Store internal-testing walkthrough |
| [`memory/PRD.md`](./memory/PRD.md)             | Original product spec + phase backlog                                    |

---

## License

Proprietary — Smart WorkLog AI, built by Hakuna Matata.
