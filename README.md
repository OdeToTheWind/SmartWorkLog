# Smart WorkLog AI

> AI-powered workforce daily-update and task management SaaS with multi-tenant architecture, role-based access control, priority escalation, Telegram bot integration, and real-time dashboards.

**Live demo (production)**: https://task-intelligence-13.emergent.host
**Preview (dev)**: https://task-intelligence-13.preview.emergentagent.com
**Telegram bot**: `@smartworklogbot`

---

## Table of Contents

1. [What it does](#what-it-does)
2. [Architecture](#architecture)
3. [Tech stack](#tech-stack)
4. [Roles & permissions](#roles--permissions)
5. [Core features](#core-features)
6. [Telegram bot commands](#telegram-bot-commands)
7. [API reference](#api-reference)
8. [Database schema](#database-schema)
9. [Local development setup](#local-development-setup)
10. [Environment variables](#environment-variables)
11. [Make.com automation](#makecom-automation)
12. [PWA / Android install](#pwa--android-install)
13. [Test credentials](#test-credentials)
14. [Project structure](#project-structure)
15. [Deferred / Phase 3 backlog](#deferred--phase-3-backlog)

---

## What it does

Smart WorkLog AI lets distributed teams submit a free-text daily update — which Gemini AI parses into structured fields (mood, urgency, summary) — and gives HR/Supervisors real-time dashboards plus a fully-fledged **Priority Escalation** system (the core differentiator):

- Any authorised role can escalate a task's priority (Low → Medium → High → Critical)
- Mandatory ≥10-character reason
- Optional "requires sacrifice" toggle — caller picks other tasks to deprioritise atomically
- Critical tasks fire immediate alerts to assignee + supervisor + HR
- Acknowledgement banner pulses red until the assignee taps "Acknowledged"
- Conflict alerts when one employee has ≥2 Critical tasks at once
- Full audit log of who escalated what, when, and why

Layered on top:
- Multi-tenant data isolation (every record scoped to `company_id`)
- 6-role RBAC (Super Admin > HR > Supervisor > Developer > Team Member > Employee)
- Two-way Telegram bot — submit daily update, create tasks, request leave, query team status — replies translated to user's preferred language
- Make.com automation — 18:00 IST daily digest + Friday weekly PDF report
- Leave management, in-app notifications, gamification (streaks + badges + weekly leaderboard)
- 7-language i18n with RTL for Arabic/Urdu
- **Light / Dark mode** with system-preference detection + manual override (zinc-950 / zinc-50 / zinc-800 palette in dark; AI buttons use indigo→purple→pink gradient)
- **Change password** & **Change email** self-service for any role (sidebar footer icons)
- **Bulk CSV import** of people (HR / Super Admin, up to 500 rows, auto-creates missing teams + temp passwords)
- **Jira OAuth one-way sync** — developers connect their Jira workspace, assigned issues mirror as technical tasks (priority/status mapped)
- PWA: installable on Android (auto-prompt + standalone display), offline-capable. Generate a real APK via PWABuilder or Bubblewrap (see DEPLOYMENT.md)

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                          REACT FRONTEND (PWA)                        │
│  - 5 role-aware dashboards (Employee / Team Member / Developer /    │
│    Supervisor / HR)                                                  │
│  - Service worker + manifest (offline + installable)                │
│  - Recharts mood trends, calendar heatmap                            │
│  - i18n (7 languages, AR/UR RTL)                                     │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ JWT (role, company_id, team_id embedded)
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      FASTAPI BACKEND (port 8001)                     │
│  - All routes under /api/*                                           │
│  - Bcrypt + JWT auth, role guards                                    │
│  - Multi-tenant enforcement (company_id from JWT claim)              │
│  - APScheduler (daily digest 18:00 UTC, Friday weekly PDF)           │
│  - Gemini 2.5 Flash (direct google-generativeai SDK)                │
│  - Emergent object storage (attachments + reports)                  │
│  - Telegram Bot API (live, auto-webhook registration on startup)    │
│  - Make.com webhook push                                             │
│  - reportlab for PDF generation                                      │
└────┬─────────────────────┬───────────────────────┬───────────────────┘
     │                     │                       │
     ▼                     ▼                       ▼
┌──────────┐    ┌────────────────────┐    ┌───────────────────┐
│ MongoDB  │    │  Telegram Bot API  │    │  Make.com Cloud   │
│ (motor)  │    │  smartworklogbot   │    │  (2 scenarios:    │
│          │    │                    │    │   digest + PDF)   │
└──────────┘    └────────────────────┘    └───────────────────┘
```

---

## Tech stack

| Layer        | Tech                                          |
| ------------ | --------------------------------------------- |
| Frontend     | React 19, React Router, Tailwind CSS, shadcn/ui, Recharts, @phosphor-icons/react, lucide-react, sonner toast, axios |
| Backend      | FastAPI, motor (async MongoDB), pydantic, bcrypt, PyJWT, requests |
| Database     | MongoDB (multi-tenant, scoped by `company_id`) |
| AI           | **Gemini 2.5 Flash** via `google-genai` SDK (direct Google API) |
| Scheduler    | APScheduler (in-process AsyncIOScheduler)     |
| PDF          | reportlab                                     |
| File storage | Emergent managed object storage               |
| Messaging    | Telegram Bot API (auto-webhook on startup)    |
| Automation   | Make.com (free plan, 2 scenarios)             |
| PWA          | Custom service worker + manifest.json         |
| Build        | craco (CRA), yarn                             |

---

## Roles & permissions

Hierarchy (highest → lowest):

| Role         | Color  | Scope                                                                |
| ------------ | ------ | -------------------------------------------------------------------- |
| Super Admin  | slate  | Full system. Creates HR accounts.                                    |
| HR Manager   | green  | Full company. Creates all other roles, sees all data, GDPR purge.    |
| Supervisor   | indigo | Their team only. Manages tasks, approves leave, audit log for team.  |
| Developer    | teal   | Technical tasks across their team. Kanban view.                      |
| Team Member  | blue   | Own + shared tasks.                                                  |
| Employee     | purple | Own tasks only. Submits daily update.                                |

### Task action matrix

| Action                              | Employee | Team Member | Developer | Supervisor | HR | Super Admin |
| ----------------------------------- | :------: | :---------: | :-------: | :--------: | :-: | :---------: |
| Create own task                     |    ✅    |     ✅      |    ✅     |     ✅     | ✅ |     ✅      |
| Assign task to others               |    ❌    |     ❌      |   tech    |   team     | ✅ |     ✅      |
| Create shared task                  |    ❌    |     ✅      |    ✅     |     ✅     | ✅ |     ✅      |
| Edit status of own task             |    ✅    |     ✅      |    ✅     |     ✅     | ✅ |     ✅      |
| Edit priority Low→Medium / Med→High |    ✅    |     ✅      |    ✅     |     ✅     | ✅ |     ✅      |
| Set Critical                        |    ❌    |     ❌      |   tech    |     ✅     | ✅ |     ✅      |
| Archive (soft delete)               |    ❌    |     ❌      |   tech    |     ✅     | ✅ |     ✅      |
| Restore archived                    |    ❌    |     ❌      |    ❌     |     ✅     | ✅ |     ✅      |
| GDPR purge user                     |    ❌    |     ❌      |    ❌     |     ❌     | ✅ |     ✅      |

---

## Core features

### Authentication
- Bcrypt password hashing
- JWT (HS256, 30-day expiry) with embedded claims: `user_id`, `company_id`, `role`, `team_id`, `supervisor_id`, `name`, `email`
- Company self-registration creates the first super admin
- HR creates all other roles

### Priority Escalation (the differentiator)
- POST `/api/tasks/{id}/priority` with body `{new_priority, reason, requires_sacrifice, sacrificed_task_ids[]}`
- Reason must be ≥ 10 characters
- Role-gated transitions (Employee Low→Med or Med→High only, etc.)
- If `requires_sacrifice=true`, listed task IDs are auto-downgraded to `low`
- Notifications fan to assignee + supervisor + HR (on Critical)
- Conflict alert if assignee has ≥2 Critical tasks at once
- Audit log captures `old`, `new`, `reason`, `performed_by`
- Critical tasks show a **pulsing red banner** at the top of the dashboard until the assignee taps "Acknowledged"

### Daily Updates
- POST `/api/daily-updates` with `{raw_message, mood_score, blocker_text, completed_task_ids[], in_progress_task_ids[]}`
- Backend calls **Gemini 2.5 Flash** to extract `mood_score`, `urgency`, `summary`, `ai_reply` (in user's language), `language`
- Streak counter increments if there was an update yesterday
- Badges auto-awarded: 7-day, 30-day, 90-day streaks
- Blocker text → supervisor notification

### Tasks
- Full CRUD with role enforcement
- Statuses: `todo`, `in_progress`, `done`, `blocked`
- Priorities: `low`, `medium`, `high`, `critical`
- Types: `general`, `technical`, `operational`, `hr`
- Recurring tasks (daily/weekly/monthly) auto-spawn next instance on Done
- Soft archive with mandatory reason (developer can only archive technical)
- Attachments via Emergent object storage (max 5MB, jpg/png/pdf/gif/webp, max 3 per update)

### Leave Management
- Employee requests leave (start/end dates, type, reason)
- Supervisor/HR approves or rejects → assignee notified
- Approved leave suppresses the 4pm reminder

### Notifications
- In-app: `/api/notifications` list, mark read, mark all read
- Telegram: any user with linked `telegram_chat_id` gets real-time pushes (priority changes, task assignments, blocker alerts, weekly digest, etc.)

### Audit Log
- Every task creation, status change, priority change, archive, restore, GDPR purge → `audit_log` collection
- Scoped read: Employees see only their own task audits; Supervisors see their team; HR sees company-wide
- Each entry: `action_type`, `performed_by_user_id`, `target_user_id`, `task_id`, `old_value`, `new_value`, `reason`, `timestamp`

### Gamification
- Streak counter on dashboard
- Auto-badges for 7/30/90-day streaks
- Weekly leaderboard (`/api/dashboard/leaderboard`) — top users by tasks completed in last 7 days

### HR analytics
- **Critical-task SLA widget** (`/api/dashboard/sla`): avg ack time (minutes), compliance %, total Critical tasks in last 30 days, currently unacknowledged
- **Mood trend** (`/api/dashboard/mood-trend?days=30`): daily aggregate mood for Recharts line chart
- **30-day heatmap** on the History page (grid of colored cells per day)
- **AI Daily Digest** card (`/api/dashboard/digest`) — 3-sentence Gemini summary

### Multi-language & RTL
- 7 languages: English, Hindi, Arabic, Urdu, Bangla, French, Swahili
- Language switcher on the History page
- AR/UR automatically switch to RTL layout
- Telegram replies + AI text auto-translate to user's preferred language

### PWA & Android install
- Installable on Android (Chrome menu → **Install app** or in-app **Install** banner that auto-appears) and iOS (Safari → Add to Home Screen)
- Manifest includes shortcuts (Daily Update, My Tasks), maskable icons, and `display: standalone` so the app opens fullscreen with no browser chrome
- Service worker caches static assets (cache-first) and `/api/*` (network-first with cache fallback)
- Theme-aware status bar — dark `#09090b` in dark mode, light `#FAFAFA` in light mode
- **APK build**: use [PWABuilder](https://www.pwabuilder.com/) (web GUI) or [Bubblewrap CLI](https://github.com/GoogleChromeLabs/bubblewrap) to wrap the PWA as a Trusted Web Activity for Google Play submission — see DEPLOYMENT.md

### Light / Dark mode
- Three-state toggle: **System / Light / Dark** — icon in the sidebar footer (sun, moon, or desktop)
- Honors `prefers-color-scheme`; manual choice persisted in `localStorage.worklog_theme`
- Dark palette: `bg-zinc-950` / `text-zinc-50` / `border-zinc-800` (shadcn-mapped CSS variables)
- **AI-distinct CTAs** — every Gemini-powered button uses the `ai-gradient` class (indigo → purple → pink)

### GDPR right-to-delete
- HR/Super Admin only
- Two-step confirmation modal — user must type exactly `DELETE PERMANENTLY`
- Cascade-deletes: user record, tasks assigned, daily updates, notifications, leaves, audit log entries (for and by the user), attachments (soft-deleted)
- Irreversible

---

## Telegram bot commands

Bot username: **`@smartworklogbot`**

### All-role commands
| Command                                       | What it does                                                       |
| --------------------------------------------- | ------------------------------------------------------------------ |
| `/start`                                      | Welcome + auto-link if username matches a known user               |
| `/tasks` or `my tasks`                        | List open tasks sorted by priority                                 |
| `/newtask <title>` or `new task: <title>`     | Create a task with AI-extracted priority/due-date/type             |
| `/acknowledge`                                | Acknowledge the oldest unacknowledged Critical task                |
| `/leave` or "I'm on leave tomorrow"           | Register a leave request for tomorrow                              |
| (any free-text)                               | Treated as a daily update, parsed by Gemini, stored in DB          |

### Supervisor / HR
| Command            | Role(s)            | What it does                                          |
| ------------------ | ------------------ | ----------------------------------------------------- |
| `/teamstatus`      | Supervisor, HR, SA | Today's update count + avg mood + missing count       |
| `/teammood`        | HR, SA             | 7-day team mood average + low-mood entry count        |
| `/pendingleaves`   | HR, SA             | List of pending leave requests                        |
| `/criticaltasks`   | Supervisor, HR, SA | All open Critical tasks across the team / company     |

### Auto-link via `/start`
When a user with a linked Telegram **username** (e.g. `@QuestSong` stored in their profile) opens the bot and taps Start:
1. Backend looks up by `telegram_username`
2. Captures the numeric `chat.id` from the Telegram payload
3. Writes it to `telegram_chat_id` in the user record
4. Sends a localised welcome message including the captured chat id
From this point, all outbound messages from the backend (digests, alerts, priority changes) flow directly to that chat.

---

## API reference

All routes are prefixed with `/api`. Authentication via `Authorization: Bearer <jwt>`.

### Auth
| Method | Path                                | Description                                        |
| ------ | ----------------------------------- | -------------------------------------------------- |
| POST   | `/api/auth/register-company`        | Create company + super admin                       |
| POST   | `/api/auth/login`                   | Returns `{token, user}`                            |
| GET    | `/api/auth/me`                      | Current user                                       |
| POST   | `/api/auth/change-password`         | `{current_password, new_password}` — 8 char min    |
| POST   | `/api/auth/change-email`            | `{current_password, new_email}` — re-issues JWT    |

### Users & Teams
| Method | Path                       | Roles                | Description                                    |
| ------ | -------------------------- | -------------------- | ---------------------------------------------- |
| POST   | `/api/users`               | super_admin, hr      | Create user (role/team/supervisor/lang/tg)     |
| POST   | `/api/users/bulk-import`   | super_admin, hr      | CSV bulk import (up to 500 rows)               |
| GET    | `/api/users`               | all                  | Scoped list (supervisor sees team only)        |
| PATCH  | `/api/users/me`            | all                  | Update own timezone, language, telegram, prefs |
| DELETE | `/api/users/{id}/purge`    | hr, super_admin      | GDPR purge (body: `{"confirmation_text": "DELETE PERMANENTLY"}`) |
| POST   | `/api/teams`               | super_admin, hr      | Create team                                    |
| GET    | `/api/teams`               | all                  | List teams                                     |

### Tasks
| Method | Path                                | Description                                         |
| ------ | ----------------------------------- | --------------------------------------------------- |
| POST   | `/api/tasks`                        | Create task (role-gated)                            |
| GET    | `/api/tasks?status=&priority=&scope=` | Scoped list                                       |
| GET    | `/api/tasks/{id}`                   | Get task                                            |
| PATCH  | `/api/tasks/{id}`                   | Update title/description/status/due/blocker        |
| POST   | `/api/tasks/{id}/priority`          | **Priority Escalation** (see body schema above)     |
| POST   | `/api/tasks/{id}/acknowledge`       | Acknowledge a Critical task                         |
| POST   | `/api/tasks/{id}/archive`           | Soft delete (body: `{"reason": "..."}`)             |
| POST   | `/api/tasks/{id}/restore`           | Restore archived                                    |
| GET    | `/api/tasks-archived`               | List archived (super_admin/hr/supervisor only)      |

### Daily Updates
| Method | Path                  | Description                                      |
| ------ | --------------------- | ------------------------------------------------ |
| POST   | `/api/daily-updates`  | Submit + Gemini parse                            |
| GET    | `/api/daily-updates`  | List (role-scoped)                               |

### Leave
| Method | Path                          | Description                  |
| ------ | ----------------------------- | ---------------------------- |
| POST   | `/api/leaves`                 | Request leave                |
| GET    | `/api/leaves`                 | List (role-scoped)           |
| POST   | `/api/leaves/{id}/approve`    | Approve/reject (sup/hr)      |

### Notifications
| Method | Path                                | Description           |
| ------ | ----------------------------------- | --------------------- |
| GET    | `/api/notifications`                | List own              |
| POST   | `/api/notifications/{id}/read`      | Mark read             |
| POST   | `/api/notifications/read-all`       | Mark all read         |

### Files (Emergent object storage)
| Method | Path                                | Description                                        |
| ------ | ----------------------------------- | -------------------------------------------------- |
| POST   | `/api/files/upload`                 | Multipart upload (5MB cap, jpg/png/pdf/gif/webp)   |
| GET    | `/api/files/{file_id}?auth=<jwt>`   | Stream file (header or query token)                |
| GET    | `/api/files`                        | List own/team files                                |
| DELETE | `/api/files/{file_id}`              | Soft delete                                        |

### Audit
| Method | Path                | Description                                |
| ------ | ------------------- | ------------------------------------------ |
| GET    | `/api/audit-log`    | Filter by `action`, `user_id`, `limit`     |

### Dashboards
| Method | Path                                  | Description                                  |
| ------ | ------------------------------------- | -------------------------------------------- |
| GET    | `/api/dashboard/summary`              | Role-scoped counts                           |
| GET    | `/api/dashboard/digest`               | AI digest paragraph                          |
| GET    | `/api/dashboard/leaderboard`          | Top 10 by completed tasks (7-day)            |
| GET    | `/api/dashboard/sla`                  | Critical-task SLA metrics                    |
| GET    | `/api/dashboard/mood-trend?days=30`   | Daily aggregate mood                         |

### Telegram
| Method | Path                       | Description                                                |
| ------ | -------------------------- | ---------------------------------------------------------- |
| POST   | `/api/telegram/webhook`    | Inbound from Telegram (no auth — Telegram-signed)          |
| POST   | `/api/telegram/link`       | Link username + chat_id to current user                    |

### Make.com cron
| Method | Path                                                  | Description                                                              |
| ------ | ----------------------------------------------------- | ------------------------------------------------------------------------ |
| POST   | `/api/cron/generate-digest?secret=...`                | Body `{"timezone": "Asia/Kolkata"}` → digest for HRs in that timezone    |
| POST   | `/api/cron/generate-weekly-pdf?company_id=...&secret=...` | Generates PDF, uploads to storage, pushes file URL to Make.com         |

### Admin helpers
| Method | Path                                | Description                                       |
| ------ | ----------------------------------- | ------------------------------------------------- |
| POST   | `/api/admin/run-digest-now`         | Manual digest for own company (hr/super_admin)    |
| POST   | `/api/admin/run-weekly-pdf-now`     | Manual weekly PDF                                 |

### Integrations: Jira (OAuth 2.0 3LO, one-way read-only sync)
| Method | Path                                | Description                                                              |
| ------ | ----------------------------------- | ------------------------------------------------------------------------ |
| GET    | `/api/integrations/jira/status`     | Whether server is configured and the current user is connected           |
| GET    | `/api/integrations/jira/auth-url`   | Returns Atlassian OAuth authorize URL with a CSRF state                  |
| POST   | `/api/integrations/jira/callback`   | `{code, state}` — exchanges auth code for tokens, stores them encrypted  |
| POST   | `/api/integrations/jira/sync`       | Pulls up to 200 assigned Jira issues, mirrors them as technical tasks    |
| POST   | `/api/integrations/jira/disconnect` | Deletes the stored Jira tokens for current user                          |

---

## Database schema

All collections are scoped by `company_id`. Documents use UUID `id` field (not Mongo `_id`).

| Collection         | Key fields                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `companies`        | `id`, `name`, `working_days[]`, `retention_months`, `created_at`                                                    |
| `users`            | `id`, `company_id`, `name`, `email`, `password_hash`, `role`, `team_id`, `supervisor_id`, `timezone`, `language`, `telegram_username`, `telegram_chat_id`, `streak_count`, `badges[]`, `active` |
| `teams`            | `id`, `company_id`, `name`, `supervisor_id`, `member_ids[]`                                                         |
| `tasks`            | `id`, `company_id`, `title`, `description`, `assigned_to_user_id`, `created_by_user_id`, `team_id`, `status`, `priority`, `type`, `due_date`, `is_recurring`, `recurrence_rule`, `is_shared`, `shared_with_user_ids[]`, `blocker_text`, `acknowledged_at`, `archived`, `archive_reason` |
| `daily_updates`    | `id`, `company_id`, `user_id`, `date`, `raw_message`, `completed_task_ids[]`, `in_progress_task_ids[]`, `blocker_text`, `mood_score`, `urgency`, `ai_summary`, `ai_reply`, `language` |
| `audit_log`        | `id`, `company_id`, `action_type`, `performed_by_user_id`, `target_user_id`, `task_id`, `old_value`, `new_value`, `reason`, `timestamp` |
| `priority_changes` | `id`, `company_id`, `task_id`, `changed_by_user_id`, `old_priority`, `new_priority`, `reason`, `affected_users[]`, `sacrificed_task_ids[]`, `timestamp` |
| `leaves`           | `id`, `company_id`, `user_id`, `start_date`, `end_date`, `leave_type`, `reason`, `status`, `approved_by`            |
| `notifications`    | `id`, `company_id`, `user_id`, `type`, `message`, `read`, `related_task_id`, `created_at`                            |
| `attachments`      | `id`, `company_id`, `user_id`, `storage_path`, `original_filename`, `content_type`, `size`, `task_id`, `daily_update_date`, `is_deleted`, `report` |

---

## Local development setup

### Prerequisites
- Python 3.11+
- Node 18+ (yarn)
- MongoDB (local or remote)

### Backend
```bash
cd backend
pip install -r requirements.txt
cp ../ENV_REFERENCE.md ../.env  # copy & fill values
uvicorn server:app --reload --host 0.0.0.0 --port 8001
```

### Frontend
```bash
cd frontend
yarn install
cp .env.example .env
echo "REACT_APP_BACKEND_URL=http://localhost:8001" >> .env
yarn start
```

Open http://localhost:3000

---

## Environment variables

See **[ENV_REFERENCE.md](./ENV_REFERENCE.md)** for the full list with current values.

### Backend (`/app/backend/.env`)
| Key                          | Required | Description                                                  |
| ---------------------------- | :------: | ------------------------------------------------------------ |
| `MONGO_URL`                  |    ✅    | MongoDB connection string                                    |
| `DB_NAME`                    |    ✅    | Database name                                                |
| `CORS_ORIGINS`               |    ✅    | Comma-separated origins or `*`                               |
| `JWT_SECRET`                 |    ✅    | JWT signing secret                                           |
| `GEMINI_API_KEY`             |    ✅    | Google AI Studio API key (direct, not via Emergent)          |
| `EMERGENT_LLM_KEY`           |    ✅    | Object storage init                                          |
| `TELEGRAM_BOT_TOKEN`         |    🟡    | BotFather token (bot stays mocked if empty)                  |
| `MAKE_WEBHOOK_SECRET`        |    ✅    | Shared secret for `/api/cron/*` endpoints                    |
| `MAKE_DIGEST_WEBHOOK_URL`    |    🟡    | Where to POST the daily digest payload                       |
| `MAKE_WEEKLY_PDF_WEBHOOK_URL`|    🟡    | Where to POST the weekly PDF payload                         |
| `SCHEDULER_ENABLED`          |    🟡    | `true` to enable APScheduler in-process                      |
| `DIGEST_HOUR_UTC`            |    🟡    | Hour (0–23) for daily digest                                 |
| `PUBLIC_BASE_URL`            |    ✅ (prod) | Used for Telegram setWebhook + PDF download URLs        |

### Frontend (`/app/frontend/.env`)
| Key                       | Description                              |
| ------------------------- | ---------------------------------------- |
| `REACT_APP_BACKEND_URL`   | Public URL of FastAPI backend            |

---

## Make.com automation

Two scenarios (both included on the free plan).

### Scenario 1 — Daily Digest
- Trigger: Schedule (e.g. **12:30 UTC = 18:00 IST**)
- Action: HTTP POST to `https://task-intelligence-13.emergent.host/api/cron/generate-digest?secret=<MAKE_WEBHOOK_SECRET>` with JSON body `{"timezone": "Asia/Kolkata"}`
- Backend filters all HRs/Super Admins in that timezone, generates per-company digest via Gemini, sends Telegram, pushes payload back to `MAKE_DIGEST_WEBHOOK_URL` so Make.com can fan out further (email, Slack, etc.)

### Scenario 2 — Weekly PDF
- Trigger: Schedule **Friday 12:30 UTC**
- Action: HTTP POST to `https://task-intelligence-13.emergent.host/api/cron/generate-weekly-pdf?secret=<MAKE_WEBHOOK_SECRET>` with optional `?company_id=...`
- Backend builds the PDF (reportlab), uploads to Emergent object storage, pushes `{file_url, stats, hr_recipients}` to `MAKE_WEEKLY_PDF_WEBHOOK_URL`

### Adding more timezones
Just duplicate Scenario 1 in Make.com and change the schedule + body, e.g.:
- `13:00 UTC` → `{"timezone": "Europe/London"}` (BST teams)
- `23:00 UTC` → `{"timezone": "America/New_York"}` (EDT teams)

No backend code changes needed.

---

## PWA / Android install

### From Chrome on Android
1. Visit the live URL
2. **Auto-prompt**: a gradient "Install Smart WorkLog" banner appears at the bottom — tap **Install**
3. Or tap ⋮ menu → **Install app** (Add to Home Screen)
4. Smart WorkLog icon appears on home screen
5. Tap → opens full-screen (no browser chrome). The `manifest.json` declares `display: standalone`, so it looks native.
6. Offline pages cached automatically; daily updates queue and sync when back online

### From iOS Safari
Share → "Add to Home Screen" (PWA install API is not available on iOS, no auto-prompt)

### Generate a real APK / Play Store build
The complete build kit is already in this repo:

```
/app/android/twa-manifest.json    # Bubblewrap config pre-filled for Smart WorkLog
/app/android/build.sh             # One-command AAB build script
/app/frontend/public/.well-known/assetlinks.json    # Domain↔APK verification template
/app/PLAYSTORE_UPLOAD.md          # Complete step-by-step submission walkthrough
```

Run on your laptop:
```bash
cd /app/android
./build.sh        # Produces app-release-bundle.aab + app-release-signed.apk
```

Then follow `/app/PLAYSTORE_UPLOAD.md` for the Play Console upload + tester invite flow (~30–45 min first time, ~5 min for updates).

### What's cached
- All static assets (cache-first via service worker)
- `/api/*` responses (network-first with cache fallback for offline reads)
- Manifest now includes app shortcuts (Daily Update, My Tasks) — long-press the home-screen icon to access them

---

## Test credentials

### HR (real account, used for the demo)
- **Email**: `bhargavi.badal@gmail.com`
- **Password**: `hakuna2026`
- **Role**: HR · **Company**: Hakuna Matata · **Timezone**: Asia/Kolkata
- **Telegram**: `@QuestSong` (chat_id captured automatically on /start)

### Super Admin (test/demo company)
- **Email**: `admin@acme.com`
- **Password**: `pass1234`
- Company: Acme (seeded with priority-escalation test data)

> ⚠ These credentials are in the preview environment only and will not be pushed to the GitHub repo (`test_credentials.md` and `.env` are auto-excluded by Emergent's GitHub integration).

---

## Project structure

```
/app
├── backend/
│   ├── server.py              # All FastAPI routes + AI + scheduler + Telegram
│   ├── requirements.txt       # Pinned Python deps
│   └── .env                   # Secrets (NOT in git)
├── frontend/
│   ├── public/
│   │   ├── manifest.json      # PWA manifest
│   │   └── sw.js              # Service worker (offline + cache)
│   ├── src/
│   │   ├── App.js             # React Router + AuthProvider + I18nProvider
│   │   ├── App.css, index.css # Tailwind + custom theme variables
│   │   ├── lib/
│   │   │   ├── api.js         # axios instance + JWT interceptor
│   │   │   ├── auth.jsx       # AuthContext + role colors
│   │   │   └── i18n.jsx       # 7-language string table + RTL switcher
│   │   ├── components/
│   │   │   ├── Layout.jsx     # Sidebar nav (role-aware)
│   │   │   ├── TaskCard.jsx
│   │   │   ├── PriorityModal.jsx        # Escalation modal (reason + sacrifice)
│   │   │   ├── CriticalBanner.jsx       # Top pulsing red banner
│   │   │   ├── SLAWidget.jsx            # HR critical-task SLA card
│   │   │   ├── AttachmentUploader.jsx
│   │   │   ├── GdprPurgeDialog.jsx
│   │   │   └── ui/            # shadcn primitives
│   │   └── pages/
│   │       ├── Login.jsx, Dashboard.jsx, Tasks.jsx, People.jsx
│   │       ├── Notifications.jsx, Leave.jsx, AuditLog.jsx, Leaderboard.jsx
│   │       ├── DailyUpdate.jsx, History.jsx
│   ├── package.json, tailwind.config.js, craco.config.js
│   └── .env                   # REACT_APP_BACKEND_URL (NOT in git)
├── memory/
│   ├── PRD.md                 # Original spec + shipped / deferred features
│   └── test_credentials.md    # Excluded from git
├── README.md                  # ← this file
└── ENV_REFERENCE.md           # Full env-var template
```

---

## Deferred / Phase 3 backlog

- Standalone React Native Android APK (current PWA covers Android already)
- FCM push notifications for the native app
- Jira / Trello / Asana OAuth one-way sync for developers
- Photo capture from Telegram message → upload to Emergent storage
- Photo capture inline in the Daily Update form (camera button)
- Per-user quiet hours enforcement on push
- Per-timezone cron for the 4pm "no update yet" reminder
- HR / Super Admin custom email notifications via Resend or SendGrid
- Custom domain (e.g. `worklog.yourcompany.com`) — easy bundled upsell

---

## License

Proprietary — Smart WorkLog AI, built by Hakuna Matata. All rights reserved.

## Acknowledgements

- Built on **[Emergent](https://emergent.sh)** platform
- AI by **Google Gemini 2.5 Flash**
- Messaging by **Telegram Bot API**
- Automation by **Make.com**
- UI primitives by **shadcn/ui**
- Icons by **Phosphor** + **Lucide**
