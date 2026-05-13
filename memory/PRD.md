# Smart WorkLog AI — PRD

## Original problem statement
Build a full-stack workforce daily-update and task management system with AI intelligence, role-based access, real-time dashboards and a priority escalation system as the core differentiator. (Full spec in conversation history.)

## Tech (Phase 1)
- Backend: FastAPI + Motor + MongoDB
- Auth: JWT (HS256) with role, company_id, team_id, supervisor_id embedded
- AI: Gemini 2.5 Flash via emergentintegrations (`EMERGENT_LLM_KEY`)
- Frontend: React 19 + Tailwind + shadcn/ui + @phosphor-icons/react + Recharts + sonner
- Multi-tenant: every query/route scoped by `company_id` from JWT

## User personas
1. Super Admin — runs platform, creates companies/HRs
2. HR Manager — full company-wide access; creates roles, sees all data
3. Supervisor — manages their direct reports' tasks, leave, mood
4. Developer — owns technical tasks, kanban view
5. Team Member — collaborates on shared tasks
6. Employee — own tasks + daily update

## Implemented (Feb 2026)
- **Service worker fix for stale bundles (Feb 2026, P0 prod issue)**: Fixed MIME-type errors on production where users saw white screens with CSS/JS served as `text/html`. Root cause: `sw.js` v1 was cache-first for `/index.html` → after a redeploy with new bundle hashes, SW served stale HTML referencing files that no longer exist. Fixed in `sw.js` v3: network-first for HTML navigations, never cache `/static/*` (webpack already cache-busts), bumped cache name to evict v1 caches on next activate. Users stuck on v1 need a single hard-refresh; self-healing thereafter.
- **Documentation pack (Feb 2026)**: New consolidated `KEYS_AND_ENV.md` (every secret + acquisition guide in one private file), new `MIGRATION.md` (Emergent → self-hosted server playbook), full README rewrite (~588 lines, covers website + APK + Jira + dark mode), `PLAYSTORE_UPLOAD.md` reorganised with **direct APK distribution** as the primary path.
- **Light / Dark mode**: Three-state toggle (System / Light / Dark) via `ThemeProvider`. Dark palette: `bg-zinc-950` / `text-zinc-50` / `border-zinc-800`. AI buttons use `.ai-gradient` (indigo → purple → pink).
- **Jira OAuth one-way sync (P1)**: Atlassian 3LO OAuth, mirrors up to 200 unfinished assigned issues as technical tasks with priority/status mapping.
- **Android-ready PWA + APK build kit**: `manifest.json` with display:standalone, app shortcuts, maskable icons. `/app/android/` build kit (`twa-manifest.json` + `build.sh`) for one-command APK/AAB generation. `assetlinks.json` template at `/app/frontend/public/.well-known/`.
- **AI SDK migration (P3)**: `google-generativeai` → `google-genai` 2.0.1. Direct user API key preserved.
- **Change Password (Feb 2026)**: `POST /api/auth/change-password` (current_password + new_password, 8-char min, must differ). UI: lock icon in sidebar footer opens `ChangePasswordDialog` with show/hide toggles, strength meter and confirm field. Available to all roles. Logged to audit (`password_changed`).
- **Change Email (Feb 2026)**: `POST /api/auth/change-email` (current_password + new_email). Validates password, prevents duplicates and same-as-current. Re-issues JWT and updates session in-place so the user is not logged out. UI: envelope icon in sidebar footer opens `ChangeEmailDialog`. Logged to audit (`email_changed`).
- **Bulk CSV import for People (Feb 2026)**: `POST /api/users/bulk-import` (HR / Super Admin, max 500 rows). Auto-creates teams, resolves supervisors, auto-generates temp passwords, per-row created/skipped/errors response.
- Company registration + JWT login (`/auth/register-company`, `/auth/login`, `/auth/me`)
- People / team management (HR creates accounts with role / team / supervisor / language)
- Task CRUD with role-scoped queries (`GET /tasks`) and role-gated creation
- Status flow: todo / in_progress / done / blocked, recurring auto-spawn on Done
- **Priority Escalation system** (the differentiator):
  - Mandatory reason (≥10 chars)
  - "Requires sacrifice?" toggle with deprioritise selector
  - Role-gated transitions (employee cannot set Critical, etc.)
  - Notifies employee + supervisor + HR (on critical)
  - Conflict alert when employee has ≥2 critical tasks
- Critical acknowledgement banner with red pulse animation
- Daily update with Gemini AI parsing (mood, urgency, summary, AI reply, language)
- Streak counter + auto-badges (7/30/90-day)
- Leave management (request, supervisor/HR approve, notification)
- In-app notifications (list, mark read, mark all read)
- Full audit log (filterable by role scope)
- Weekly leaderboard
- 5 role-aware dashboards (mobile-responsive Employee/Supervisor)
- Sidebar nav with role colour accents (purple/blue/teal/indigo/green)

## Deferred (Phase 2 backlog)
### Shipped May 2026
- **Telegram bot scaffold** (MOCKED until `TELEGRAM_BOT_TOKEN` env set): `/api/telegram/webhook` accepts updates, role-aware commands (my tasks, acknowledge, leave, team status, team mood today, pending leaves, critical tasks), free-text → Gemini AI parse, replies translated to user's preferred language via Gemini. `/api/telegram/link` binds chat_id.
- **Make.com cron endpoints**: `/api/cron/generate-digest` (6pm digest) and `/api/cron/generate-weekly-pdf` (Friday weekly PDF via reportlab → uploaded to Emergent object storage → HR notified). Auth via `MAKE_WEBHOOK_SECRET`.
- **Object storage attachments** via Emergent managed storage: `/api/files/upload` (5MB cap, jpg/png/pdf/gif/webp), `/api/files/{id}` serves via header- or query-token auth, `/api/files` listing scoped per role, soft-delete.
- **GDPR right-to-delete** (`DELETE /api/users/{id}/purge`): two-step confirmation (exact phrase `DELETE PERMANENTLY`), cascade-deletes tasks/updates/notifications/leaves/audit/attachments, irreversible. UI dialog: two-step modal in People page.
- **HR Critical-task SLA widget**: `/api/dashboard/sla` returns avg ack minutes, compliance %, breaches over 30 min, currently unacknowledged. Displayed on HR/Supervisor/Super Admin dashboards.
- **Mood trend chart** (Recharts line) + **30-day activity heatmap** on new `/history` page.
- **PWA**: `manifest.json` + `sw.js` with cache-first for static and network-first for `/api/*` → installable on Android, offline-capable.
- **Multi-language i18n** + RTL: 7 languages (en/hi/ar/ur/bn/fr/sw), AR/UR auto-RTL, switcher in History page, Telegram replies translated.


- Telegram two-way bot
- FCM push notifications
- Make.com cron (6pm digest + Friday PDF)
- Jira/Trello/Asana sync
- Photo attachments to Firebase Storage
- Multi-language UI + RTL layout
- Offline mode for native Android
- GDPR right-to-delete with permanent purge
- Per-timezone cron reminders
- React Native Android app

## Next action items
- **User action (P0)**: Redeploy production so `sw.js` v3 + the PWA icons + the APK download endpoint reach `task-intelligence-13.emergent.host`. Without this redeploy, the white-screen and missing-icons issues persist.
- **User action (laptop)**: `cd /app/android && ./build.sh` on a JDK 17 + Node 18 laptop → produces `app-release-signed.apk`. Upload that file to `/app/android/app-release-signed.apk` in Emergent → the APK Download banner immediately appears for every user inside the app.
- (Optional) Refactor `/app/backend/server.py` (~1,900 lines) into modular routers
) into modular FastAPI routers — deferred at user request
- (Optional) Add Trello / Asana adapters alongside Jira
