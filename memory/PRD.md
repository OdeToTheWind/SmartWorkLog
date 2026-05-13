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
- **Change Password (Feb 2026)**: `POST /api/auth/change-password` (current_password + new_password, 8-char min, must differ). UI: lock icon in sidebar footer opens `ChangePasswordDialog` with show/hide toggles, strength meter and confirm field. Available to all roles. Logged to audit (`password_changed`).
- **Change Email (Feb 2026)**: `POST /api/auth/change-email` (current_password + new_email). Validates password, prevents duplicates and same-as-current. Re-issues JWT and updates session in-place so the user is not logged out. UI: envelope icon in sidebar footer opens `ChangeEmailDialog`. Logged to audit (`email_changed`).
- **Bulk CSV import for People (Feb 2026)**: `POST /api/users/bulk-import` (HR / Super Admin, max 500 rows). Accepts rows with name, email + optional password/role/team_name/supervisor_email/timezone/language/telegram_id. Auto-creates missing teams (toggleable), resolves supervisor by email, auto-generates temporary password when omitted, returns per-row created/skipped/errors summary. UI: "Bulk import" button on People page opens `BulkImportDialog` with template download, client-side CSV parser, preview, results panel and CSV export of created users + temp passwords.
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
- Jira/Trello/Asana OAuth one-way sync for developers (P1, deferred)
- Refactor `/app/backend/server.py` (1,800+ lines) into modular FastAPI routers (P3)
- Migrate `google-generativeai` → `google-genai` SDK (P3, user marked "not required")
