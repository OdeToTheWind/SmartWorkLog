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
- User to manually try priority escalation flow end-to-end
- Optionally add chart (Recharts mood trend) on Dashboard
- Phase 2 features by user priority
