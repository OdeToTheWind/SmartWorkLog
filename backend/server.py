"""Smart WorkLog AI - FastAPI Backend
Multi-tenant workforce management. JWT auth. Priority escalation. Audit log. AI daily-update parsing via Gemini 2.5 Flash.
"""
from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, Request, UploadFile, File, Query, Header, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta, date
from pathlib import Path
import os, uuid, logging, bcrypt, jwt, json, asyncio, io, requests

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ['JWT_SECRET']
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
TELEGRAM_BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')  # MOCKED if empty
MAKE_WEBHOOK_SECRET = os.environ.get('MAKE_WEBHOOK_SECRET', 'change-me-make-secret')
MAKE_DIGEST_WEBHOOK_URL = os.environ.get('MAKE_DIGEST_WEBHOOK_URL', '')
MAKE_WEEKLY_PDF_WEBHOOK_URL = os.environ.get('MAKE_WEEKLY_PDF_WEBHOOK_URL', '')
JIRA_CLIENT_ID = os.environ.get('JIRA_CLIENT_ID', '')
JIRA_CLIENT_SECRET = os.environ.get('JIRA_CLIENT_SECRET', '')
JIRA_REDIRECT_URI = os.environ.get('JIRA_REDIRECT_URI', '')
JIRA_OAUTH_STATE_SECRET = os.environ.get('JIRA_OAUTH_STATE_SECRET', 'jira-state-change-me')
SCHEDULER_ENABLED = os.environ.get('SCHEDULER_ENABLED', 'false').lower() == 'true'
DIGEST_HOUR_UTC = int(os.environ.get('DIGEST_HOUR_UTC', '18'))
PUBLIC_BASE_URL = os.environ.get('PUBLIC_BASE_URL', '')
APP_NAME = "smart-worklog-ai"
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
storage_key: Optional[str] = None

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Smart WorkLog AI")
api = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger("worklog")

# ---------- ROLES ----------
ROLES = ["super_admin", "hr", "supervisor", "developer", "team_member", "employee"]
ROLE_RANK = {r: i for i, r in enumerate(ROLES)}  # lower index = higher authority

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def gen_id() -> str:
    return str(uuid.uuid4())

# ---------- PYDANTIC MODELS ----------
class TokenUser(BaseModel):
    user_id: str
    company_id: str
    role: str
    team_id: Optional[str] = None
    supervisor_id: Optional[str] = None
    name: str
    email: str

class RegisterCompanyIn(BaseModel):
    company_name: str
    admin_name: str
    admin_email: EmailStr
    admin_password: str

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class CreateUserIn(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str
    team_id: Optional[str] = None
    supervisor_id: Optional[str] = None
    timezone: str = "UTC"
    language: str = "en"
    telegram_id: Optional[str] = None

class CreateTeamIn(BaseModel):
    name: str
    supervisor_id: Optional[str] = None

class TaskIn(BaseModel):
    title: str
    description: str = ""
    assigned_to_user_id: str
    type: str = "general"  # technical/operational/hr/general
    priority: str = "medium"  # low/medium/high/critical
    due_date: Optional[str] = None
    is_recurring: bool = False
    recurrence_rule: Optional[str] = None
    is_shared: bool = False
    shared_with_user_ids: List[str] = []

class TaskUpdateIn(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None  # todo/in_progress/done/blocked
    due_date: Optional[str] = None
    blocker_text: Optional[str] = None

class PriorityChangeIn(BaseModel):
    new_priority: str
    reason: str
    requires_sacrifice: bool = False
    sacrificed_task_ids: List[str] = []

class DailyUpdateIn(BaseModel):
    raw_message: str
    completed_task_ids: List[str] = []
    in_progress_task_ids: List[str] = []
    blocker_text: Optional[str] = None
    mood_score: Optional[int] = None  # 1-5

class LeaveIn(BaseModel):
    start_date: str
    end_date: str
    leave_type: str = "annual"
    reason: Optional[str] = None

class LeaveApproveIn(BaseModel):
    approved: bool
    note: Optional[str] = None

class ArchiveIn(BaseModel):
    reason: str

# ---------- AUTH HELPERS ----------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

def make_token(u: dict) -> str:
    payload = {
        "user_id": u["id"],
        "company_id": u["company_id"],
        "role": u["role"],
        "team_id": u.get("team_id"),
        "supervisor_id": u.get("supervisor_id"),
        "name": u["name"],
        "email": u["email"],
        "exp": datetime.now(timezone.utc) + timedelta(days=30),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

async def current_user(creds: HTTPAuthorizationCredentials = Depends(security)) -> TokenUser:
    if not creds:
        raise HTTPException(401, "Missing token")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError as e:
        raise HTTPException(401, f"Invalid token: {e}")
    return TokenUser(**{k: payload.get(k) for k in ["user_id","company_id","role","team_id","supervisor_id","name","email"]})

def require_roles(*roles: str):
    def dep(u: TokenUser = Depends(current_user)) -> TokenUser:
        if u.role not in roles:
            raise HTTPException(403, f"Role {u.role} not allowed; needs one of {roles}")
        return u
    return dep

# ---------- AUDIT + NOTIFICATIONS ----------
async def audit(company_id: str, action: str, by_user: str, target_user: Optional[str], task_id: Optional[str], old: Any, new: Any, reason: Optional[str] = None):
    def _clean(v):
        if isinstance(v, dict):
            return {k: _clean(x) for k, x in v.items() if k != "_id"}
        if isinstance(v, list):
            return [_clean(x) for x in v]
        return v
    await db.audit_log.insert_one({
        "id": gen_id(),
        "company_id": company_id,
        "action_type": action,
        "performed_by_user_id": by_user,
        "target_user_id": target_user,
        "task_id": task_id,
        "old_value": _clean(old),
        "new_value": _clean(new),
        "reason": reason,
        "timestamp": now_iso(),
    })

async def notify(company_id: str, user_id: str, type_: str, message: str, related_task_id: Optional[str] = None):
    await db.notifications.insert_one({
        "id": gen_id(),
        "company_id": company_id,
        "user_id": user_id,
        "type": type_,
        "message": message,
        "read": False,
        "related_task_id": related_task_id,
        "created_at": now_iso(),
    })

# ---------- AI (Gemini 2.5 Flash — direct Google API via google-genai SDK) ----------
_gemini_client = None
def _ensure_gemini():
    global _gemini_client
    if _gemini_client is not None:
        return True
    if not GEMINI_API_KEY:
        return False
    try:
        from google import genai as _genai_pkg
        _gemini_client = _genai_pkg.Client(api_key=GEMINI_API_KEY)
        return True
    except Exception as e:
        log.warning(f"Gemini client init failed: {e}")
        return False

def _gemini_call(system: str, prompt: str) -> Optional[str]:
    """Synchronous Gemini call wrapped so callers can await via asyncio.to_thread."""
    if not _ensure_gemini():
        return None
    try:
        from google.genai import types as _genai_types
        resp = _gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=_genai_types.GenerateContentConfig(system_instruction=system),
        )
        return (resp.text or "").strip()
    except Exception as e:
        log.warning(f"Gemini call failed: {e}")
        return None

async def ai_parse_update(raw_message: str, known_tasks: List[dict]) -> dict:
    """Parse a daily-update text. Returns mood_score/urgency/summary/ai_reply/language."""
    task_list_str = "\n".join([f"- {t['id']}: {t['title']}" for t in known_tasks[:30]])
    system = (
        "You are a workforce assistant. Parse an employee's daily update message and return strict JSON with keys: "
        "mood_score (int 1-5), urgency (low|medium|high), summary (one sentence), ai_reply (warm 2-sentence reply in user's language), "
        "language (ISO code: en/hi/ar/ur/bn/fr/sw). Reply ONLY with JSON, no markdown."
    )
    prompt = f"Known tasks:\n{task_list_str}\n\nEmployee message:\n{raw_message}\n\nReturn JSON only."
    text = await asyncio.to_thread(_gemini_call, system, prompt)
    if not text:
        return {"mood_score": 3, "urgency": "low", "summary": raw_message[:140], "ai_reply": "Update logged.", "language": "en"}
    if text.startswith("```"):
        parts = text.split("```")
        if len(parts) >= 2:
            text = parts[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()
    try:
        data = json.loads(text)
        return {
            "mood_score": int(data.get("mood_score", 3)),
            "urgency": data.get("urgency", "low"),
            "summary": data.get("summary", raw_message[:140]),
            "ai_reply": data.get("ai_reply", "Update logged."),
            "language": data.get("language", "en"),
        }
    except Exception as e:
        log.warning(f"AI parse JSON decode failed: {e}; raw='{text[:200]}'")
        return {"mood_score": 3, "urgency": "low", "summary": raw_message[:140], "ai_reply": "Update logged.", "language": "en"}

async def ai_digest(company_id: str) -> str:
    today = date.today().isoformat()
    updates = await db.daily_updates.find({"company_id": company_id, "date": today}, {"_id": 0}).to_list(500)
    tasks_open = await db.tasks.count_documents({"company_id": company_id, "status": {"$ne": "done"}, "archived": {"$ne": True}})
    crit = await db.tasks.count_documents({"company_id": company_id, "priority": "critical", "status": {"$ne": "done"}, "archived": {"$ne": True}})
    avg_mood = sum([u.get("mood_score", 3) for u in updates]) / len(updates) if updates else 0
    raw_summary = f"Updates today: {len(updates)} | Avg mood: {avg_mood:.1f}/5 | Open tasks: {tasks_open} | Critical: {crit}"
    text = await asyncio.to_thread(
        _gemini_call,
        "You are an HR assistant. Write a friendly, plain-English 3-sentence digest based on today's workforce stats. No data dump.",
        raw_summary,
    )
    return text or raw_summary

async def tg_translate_reply(text: str, lang: str) -> str:
    if lang in ("en", "", None):
        return text
    out = await asyncio.to_thread(
        _gemini_call,
        f"Translate the user's text naturally into language code '{lang}'. Reply ONLY with the translation.",
        text,
    )
    return out or text


# ---------- ROUTES: AUTH ----------
@api.get("/")
async def root():
    return {"app": "Smart WorkLog AI", "ok": True}

@api.post("/auth/register-company")
async def register_company(body: RegisterCompanyIn):
    existing = await db.users.find_one({"email": body.admin_email}, {"_id": 0})
    if existing:
        raise HTTPException(400, "Email already exists")
    company_id = gen_id()
    user_id = gen_id()
    await db.companies.insert_one({
        "id": company_id, "name": body.company_name, "created_at": now_iso(),
        "working_days": ["mon","tue","wed","thu","fri"], "retention_months": 12,
    })
    user = {
        "id": user_id, "company_id": company_id, "name": body.admin_name, "email": body.admin_email,
        "password_hash": hash_password(body.admin_password), "role": "super_admin",
        "team_id": None, "supervisor_id": None, "timezone": "UTC", "language": "en",
        "telegram_id": None, "profile_photo_url": None, "streak_count": 0,
        "notification_prefs": {"quiet_hours": None, "do_not_disturb": False},
        "badges": [], "created_at": now_iso(), "active": True,
    }
    await db.users.insert_one(user)
    # also create HR account by default? No, super admin can create.
    token = make_token(user)
    user.pop("password_hash", None)
    return {"token": token, "user": {k: v for k, v in user.items() if k != "_id"}}

@api.post("/auth/login")
async def login(body: LoginIn):
    u = await db.users.find_one({"email": body.email, "active": True}, {"_id": 0})
    if not u or not verify_password(body.password, u["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    token = make_token(u)
    u.pop("password_hash", None)
    return {"token": token, "user": u}

@api.get("/auth/me")
async def me(u: TokenUser = Depends(current_user)):
    user = await db.users.find_one({"id": u.user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(404, "User not found")
    return user

class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str

@api.post("/auth/change-password")
async def change_password(body: ChangePasswordIn, u: TokenUser = Depends(current_user)):
    if len(body.new_password) < 8:
        raise HTTPException(400, "New password must be at least 8 characters")
    if body.current_password == body.new_password:
        raise HTTPException(400, "New password must be different from current password")
    user = await db.users.find_one({"id": u.user_id, "active": True}, {"_id": 0})
    if not user:
        raise HTTPException(404, "User not found")
    if not verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(401, "Current password is incorrect")
    await db.users.update_one({"id": u.user_id}, {"$set": {"password_hash": hash_password(body.new_password)}})
    await audit(u.company_id, "password_changed", u.user_id, u.user_id, None, None, {"self": True})
    return {"ok": True}

class ChangeEmailIn(BaseModel):
    current_password: str
    new_email: EmailStr

@api.post("/auth/change-email")
async def change_email(body: ChangeEmailIn, u: TokenUser = Depends(current_user)):
    new_email = body.new_email.lower().strip()
    user = await db.users.find_one({"id": u.user_id, "active": True}, {"_id": 0})
    if not user:
        raise HTTPException(404, "User not found")
    if not verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(401, "Password is incorrect")
    if new_email == user["email"].lower():
        raise HTTPException(400, "New email must be different from current email")
    clash = await db.users.find_one({"email": new_email, "id": {"$ne": u.user_id}}, {"_id": 0})
    if clash:
        raise HTTPException(400, "Email already in use by another account")
    old_email = user["email"]
    await db.users.update_one({"id": u.user_id}, {"$set": {"email": new_email}})
    await audit(u.company_id, "email_changed", u.user_id, u.user_id, None, {"email": old_email}, {"email": new_email})
    # Re-issue token with new email so the UI doesn't get logged out
    user["email"] = new_email
    token = make_token(user)
    user.pop("password_hash", None)
    return {"ok": True, "token": token, "user": {k: v for k, v in user.items() if k != "_id"}}

# ---------- ROUTES: USERS / TEAMS ----------
class UserProfileIn(BaseModel):
    name: Optional[str] = None
    timezone: Optional[str] = None
    language: Optional[str] = None
    telegram_id: Optional[str] = None
    notification_prefs: Optional[Dict[str, Any]] = None

@api.patch("/users/me")
async def update_my_profile(body: UserProfileIn, u: TokenUser = Depends(current_user)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        return {"ok": True}
    await db.users.update_one({"id": u.user_id}, {"$set": updates})
    return {"ok": True, "updated": updates}

class AdminUserPatch(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    team_id: Optional[str] = None  # "" to clear
    supervisor_id: Optional[str] = None  # "" to clear
    timezone: Optional[str] = None
    language: Optional[str] = None
    telegram_username: Optional[str] = None
    active: Optional[bool] = None

@api.patch("/users/{user_id}")
async def admin_update_user(user_id: str, body: AdminUserPatch, u: TokenUser = Depends(require_roles("super_admin", "hr"))):
    target = await db.users.find_one({"id": user_id, "company_id": u.company_id}, {"_id": 0, "password_hash": 0})
    if not target:
        raise HTTPException(404, "User not found")
    if u.role == "hr" and target.get("role") == "super_admin":
        raise HTTPException(403, "HR cannot modify super_admin")
    updates: Dict[str, Any] = {}
    raw = body.model_dump()
    for k, v in raw.items():
        if v is None: continue
        if k in ("team_id", "supervisor_id") and v == "":
            updates[k] = None
        elif k == "role" and v not in ROLES:
            raise HTTPException(400, f"Invalid role {v}")
        else:
            updates[k] = v
    if updates:
        await db.users.update_one({"id": user_id}, {"$set": updates})
        await audit(u.company_id, "user_updated", u.user_id, user_id, None,
                    {k: target.get(k) for k in updates.keys()}, updates)
    new_doc = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return new_doc

class TeamPatchIn(BaseModel):
    name: Optional[str] = None
    supervisor_id: Optional[str] = None  # "" to clear

@api.patch("/teams/{team_id}")
async def update_team(team_id: str, body: TeamPatchIn, u: TokenUser = Depends(require_roles("super_admin", "hr"))):
    team = await db.teams.find_one({"id": team_id, "company_id": u.company_id}, {"_id": 0})
    if not team:
        raise HTTPException(404, "Team not found")
    updates: Dict[str, Any] = {}
    if body.name is not None: updates["name"] = body.name
    if body.supervisor_id is not None:
        updates["supervisor_id"] = None if body.supervisor_id == "" else body.supervisor_id
    if updates:
        await db.teams.update_one({"id": team_id}, {"$set": updates})
        await audit(u.company_id, "team_updated", u.user_id, None, None,
                    {k: team.get(k) for k in updates.keys()}, updates)
    return await db.teams.find_one({"id": team_id}, {"_id": 0})

@api.delete("/teams/{team_id}")
async def delete_team(team_id: str, u: TokenUser = Depends(require_roles("super_admin", "hr"))):
    team = await db.teams.find_one({"id": team_id, "company_id": u.company_id}, {"_id": 0})
    if not team:
        raise HTTPException(404, "Team not found")
    # Unset team_id on any members
    moved = await db.users.update_many({"company_id": u.company_id, "team_id": team_id}, {"$set": {"team_id": None}})
    await db.teams.delete_one({"id": team_id})
    await audit(u.company_id, "team_deleted", u.user_id, None, None, team, None)
    return {"ok": True, "members_unassigned": moved.modified_count}

@api.post("/users")
async def create_user(body: CreateUserIn, u: TokenUser = Depends(current_user)):
    if u.role not in ("super_admin", "hr"):
        raise HTTPException(403, "Only Super Admin / HR can create users")
    if body.role not in ROLES:
        raise HTTPException(400, "Invalid role")
    if u.role == "hr" and body.role in ("super_admin",):
        raise HTTPException(403, "HR cannot create super_admin")
    existing = await db.users.find_one({"email": body.email}, {"_id": 0})
    if existing:
        raise HTTPException(400, "Email already exists")
    user_id = gen_id()
    doc = {
        "id": user_id, "company_id": u.company_id, "name": body.name, "email": body.email,
        "password_hash": hash_password(body.password), "role": body.role,
        "team_id": body.team_id, "supervisor_id": body.supervisor_id,
        "timezone": body.timezone, "language": body.language, "telegram_id": body.telegram_id,
        "profile_photo_url": None, "streak_count": 0,
        "notification_prefs": {"quiet_hours": None, "do_not_disturb": False},
        "badges": [], "created_at": now_iso(), "active": True,
    }
    await db.users.insert_one(doc)
    await audit(u.company_id, "user_created", u.user_id, user_id, None, None, {"role": body.role, "email": body.email})
    doc.pop("password_hash", None)
    doc.pop("_id", None)
    return doc

class BulkUserRowIn(BaseModel):
    name: str
    email: EmailStr
    password: Optional[str] = None
    role: str = "employee"
    team_name: Optional[str] = None
    supervisor_email: Optional[str] = None
    timezone: str = "UTC"
    language: str = "en"
    telegram_id: Optional[str] = None

class BulkUserImportIn(BaseModel):
    rows: List[BulkUserRowIn]
    create_missing_teams: bool = True

def _gen_default_password(name: str) -> str:
    # Predictable but per-row, so HR can communicate the temp pwd if generated.
    base = "".join(ch for ch in (name or "user").lower() if ch.isalnum())[:6] or "user"
    return f"{base}@{uuid.uuid4().hex[:6]}"

@api.post("/users/bulk-import")
async def bulk_import_users(body: BulkUserImportIn, u: TokenUser = Depends(current_user)):
    if u.role not in ("super_admin", "hr"):
        raise HTTPException(403, "Only Super Admin / HR can bulk-import users")
    if not body.rows:
        raise HTTPException(400, "No rows to import")
    if len(body.rows) > 500:
        raise HTTPException(400, "Maximum 500 rows per import")

    # Preload existing emails (case-insensitive) and teams scoped to this company
    existing_emails = {(d["email"] or "").lower() for d in await db.users.find({}, {"_id": 0, "email": 1}).to_list(50000)}
    teams = await db.teams.find({"company_id": u.company_id}, {"_id": 0}).to_list(2000)
    teams_by_name = {(t["name"] or "").strip().lower(): t for t in teams}
    company_users = await db.users.find({"company_id": u.company_id}, {"_id": 0, "id": 1, "email": 1, "role": 1}).to_list(5000)
    users_by_email = {(usr["email"] or "").lower(): usr for usr in company_users}

    created, skipped, errors = [], [], []
    seen_in_batch = set()

    for idx, row in enumerate(body.rows):
        line = idx + 1
        try:
            email = (row.email or "").lower().strip()
            if not email or not row.name:
                errors.append({"row": line, "email": email, "error": "name and email are required"})
                continue
            if email in seen_in_batch:
                skipped.append({"row": line, "email": email, "reason": "duplicate in CSV"})
                continue
            seen_in_batch.add(email)
            if email in existing_emails:
                skipped.append({"row": line, "email": email, "reason": "email already exists"})
                continue
            if row.role not in ROLES:
                errors.append({"row": line, "email": email, "error": f"invalid role '{row.role}'"})
                continue
            if u.role == "hr" and row.role == "super_admin":
                errors.append({"row": line, "email": email, "error": "HR cannot create super_admin"})
                continue

            # Resolve team
            team_id = None
            if row.team_name:
                key = row.team_name.strip().lower()
                t = teams_by_name.get(key)
                if not t and body.create_missing_teams:
                    tid = gen_id()
                    new_team = {"id": tid, "company_id": u.company_id, "name": row.team_name.strip(), "supervisor_id": None, "created_at": now_iso()}
                    await db.teams.insert_one(new_team)
                    teams_by_name[key] = new_team
                    t = new_team
                if t:
                    team_id = t["id"]

            # Resolve supervisor by email
            supervisor_id = None
            if row.supervisor_email:
                sup_email = row.supervisor_email.lower().strip()
                sup = users_by_email.get(sup_email)
                if sup and sup.get("role") in ("supervisor", "hr", "super_admin"):
                    supervisor_id = sup["id"]
                elif sup_email:
                    errors.append({"row": line, "email": email, "error": f"supervisor '{sup_email}' not found or not a supervisor"})
                    continue

            password = row.password or _gen_default_password(row.name)
            user_id = gen_id()
            doc = {
                "id": user_id, "company_id": u.company_id, "name": row.name.strip(), "email": email,
                "password_hash": hash_password(password), "role": row.role,
                "team_id": team_id, "supervisor_id": supervisor_id,
                "timezone": row.timezone or "UTC", "language": row.language or "en",
                "telegram_id": row.telegram_id, "profile_photo_url": None, "streak_count": 0,
                "notification_prefs": {"quiet_hours": None, "do_not_disturb": False},
                "badges": [], "created_at": now_iso(), "active": True,
            }
            await db.users.insert_one(doc)
            existing_emails.add(email)
            users_by_email[email] = {"id": user_id, "email": email, "role": row.role}
            created.append({
                "row": line, "id": user_id, "email": email, "name": row.name.strip(),
                "role": row.role, "temp_password": password if not row.password else None,
            })
        except Exception as exc:
            errors.append({"row": line, "email": (row.email or ""), "error": str(exc)})

    await audit(u.company_id, "user_bulk_import", u.user_id, None, None, None,
                {"created": len(created), "skipped": len(skipped), "errors": len(errors)})
    return {
        "summary": {"total": len(body.rows), "created": len(created), "skipped": len(skipped), "errors": len(errors)},
        "created": created,
        "skipped": skipped,
        "errors": errors,
    }

@api.get("/users")
async def list_users(u: TokenUser = Depends(current_user)):
    q = {"company_id": u.company_id}
    if u.role == "supervisor":
        q["$or"] = [{"supervisor_id": u.user_id}, {"id": u.user_id}]
    elif u.role in ("employee", "team_member", "developer"):
        # see teammates only
        if u.team_id:
            q["team_id"] = u.team_id
        else:
            q["id"] = u.user_id
    users = await db.users.find(q, {"_id": 0, "password_hash": 0}).to_list(2000)
    return users

@api.post("/teams")
async def create_team(body: CreateTeamIn, u: TokenUser = Depends(require_roles("super_admin", "hr"))):
    tid = gen_id()
    doc = {"id": tid, "company_id": u.company_id, "name": body.name, "supervisor_id": body.supervisor_id, "member_ids": [], "created_at": now_iso()}
    await db.teams.insert_one(doc)
    await audit(u.company_id, "team_created", u.user_id, None, None, None, {"team_id": tid, "name": body.name})
    doc.pop("_id", None)
    return doc

@api.get("/teams")
async def list_teams(u: TokenUser = Depends(current_user)):
    teams = await db.teams.find({"company_id": u.company_id}, {"_id": 0}).to_list(1000)
    return teams

# ---------- ROUTES: TASKS ----------
def can_create_task_for(role: str, target_role: str, is_shared: bool) -> bool:
    if role in ("super_admin", "hr"): return True
    if role == "supervisor": return True
    if role == "developer": return True
    if role == "team_member": return is_shared
    if role == "employee": return False  # only own; handled separately
    return False

@api.post("/tasks")
async def create_task(body: TaskIn, u: TokenUser = Depends(current_user)):
    # Role checks
    if u.role == "employee" and body.assigned_to_user_id != u.user_id:
        raise HTTPException(403, "Employees can only create tasks for themselves")
    if u.role == "team_member" and not body.is_shared:
        raise HTTPException(403, "Team members can only create shared tasks")
    target = await db.users.find_one({"id": body.assigned_to_user_id, "company_id": u.company_id}, {"_id": 0, "password_hash": 0})
    if not target:
        raise HTTPException(404, "Assignee not found in company")
    if u.role == "supervisor" and target.get("supervisor_id") != u.user_id and body.assigned_to_user_id != u.user_id:
        raise HTTPException(403, "Supervisor can only assign to own team members")

    tid = gen_id()
    doc = {
        "id": tid, "company_id": u.company_id,
        "title": body.title, "description": body.description,
        "assigned_to_user_id": body.assigned_to_user_id,
        "created_by_user_id": u.user_id,
        "team_id": target.get("team_id"),
        "status": "todo",
        "priority": body.priority if body.priority in ("low","medium","high","critical") else "medium",
        "type": body.type,
        "due_date": body.due_date,
        "is_recurring": body.is_recurring,
        "recurrence_rule": body.recurrence_rule,
        "is_shared": body.is_shared,
        "shared_with_user_ids": body.shared_with_user_ids,
        "blocker_text": None,
        "acknowledged_at": None,
        "archived": False,
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    # Employees can't set critical
    if u.role == "employee" and doc["priority"] == "critical":
        doc["priority"] = "high"
    await db.tasks.insert_one(doc)
    await audit(u.company_id, "task_created", u.user_id, body.assigned_to_user_id, tid, None, doc)
    if body.assigned_to_user_id != u.user_id:
        await notify(u.company_id, body.assigned_to_user_id, "task_assigned",
                     f"New task '{body.title}' assigned by {u.name} (Priority: {doc['priority']})", tid)
    doc.pop("_id", None)
    return doc

@api.get("/tasks")
async def list_tasks(u: TokenUser = Depends(current_user), status_: Optional[str] = None, priority: Optional[str] = None, scope: str = "auto"):
    q: Dict[str, Any] = {"company_id": u.company_id, "archived": {"$ne": True}}
    if u.role == "employee":
        q["$or"] = [{"assigned_to_user_id": u.user_id}, {"shared_with_user_ids": u.user_id}]
    elif u.role == "team_member":
        q["$or"] = [{"assigned_to_user_id": u.user_id}, {"shared_with_user_ids": u.user_id}, {"is_shared": True, "team_id": u.team_id}]
    elif u.role == "developer":
        q["$or"] = [{"type": "technical", "team_id": u.team_id}, {"assigned_to_user_id": u.user_id}]
    elif u.role == "supervisor":
        # tasks for users they supervise OR tasks they own
        team_users = await db.users.find({"supervisor_id": u.user_id, "company_id": u.company_id}, {"id": 1, "_id": 0}).to_list(2000)
        ids = [x["id"] for x in team_users] + [u.user_id]
        q["assigned_to_user_id"] = {"$in": ids}
    if status_:
        q["status"] = status_
    if priority:
        q["priority"] = priority
    items = await db.tasks.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return items

@api.get("/tasks/{tid}")
async def get_task(tid: str, u: TokenUser = Depends(current_user)):
    t = await db.tasks.find_one({"id": tid, "company_id": u.company_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Task not found")
    return t

@api.patch("/tasks/{tid}")
async def update_task(tid: str, body: TaskUpdateIn, u: TokenUser = Depends(current_user)):
    t = await db.tasks.find_one({"id": tid, "company_id": u.company_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Task not found")
    # permissions
    is_owner = t["assigned_to_user_id"] == u.user_id
    is_shared_member = t.get("is_shared") and u.user_id in t.get("shared_with_user_ids", [])
    if u.role in ("super_admin", "hr", "supervisor"):
        pass
    elif u.role == "developer" and t.get("type") == "technical":
        pass
    elif is_owner or is_shared_member:
        pass
    else:
        raise HTTPException(403, "Not allowed to edit this task")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        return t
    updates["updated_at"] = now_iso()
    await db.tasks.update_one({"id": tid}, {"$set": updates})
    await audit(u.company_id, "task_updated", u.user_id, t["assigned_to_user_id"], tid, {k: t.get(k) for k in updates.keys()}, updates)
    if t["assigned_to_user_id"] != u.user_id:
        await notify(u.company_id, t["assigned_to_user_id"], "task_updated",
                     f"Task '{t['title']}' was updated by {u.name}", tid)
    # recurring: if marked done & recurring, create next instance
    if updates.get("status") == "done" and t.get("is_recurring"):
        await _create_recurring_next(t, u)
    t2 = await db.tasks.find_one({"id": tid}, {"_id": 0})
    return t2

async def _create_recurring_next(t: dict, u: TokenUser):
    rule = t.get("recurrence_rule") or "daily"
    try:
        d = datetime.fromisoformat(t.get("due_date")) if t.get("due_date") else datetime.now(timezone.utc)
    except Exception:
        d = datetime.now(timezone.utc)
    if rule == "daily": d += timedelta(days=1)
    elif rule == "weekly": d += timedelta(days=7)
    elif rule == "monthly": d += timedelta(days=30)
    new_doc = {**t, "id": gen_id(), "status": "todo", "due_date": d.isoformat(),
               "created_at": now_iso(), "updated_at": now_iso(), "acknowledged_at": None}
    new_doc.pop("_id", None)
    await db.tasks.insert_one(new_doc)

@api.post("/tasks/{tid}/priority")
async def change_priority(tid: str, body: PriorityChangeIn, u: TokenUser = Depends(current_user)):
    if body.new_priority not in ("low","medium","high","critical"):
        raise HTTPException(400, "Invalid priority")
    if len(body.reason.strip()) < 10:
        raise HTTPException(400, "Reason must be at least 10 characters")
    t = await db.tasks.find_one({"id": tid, "company_id": u.company_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Task not found")
    old_p = t["priority"]
    # Role gating
    if u.role == "employee":
        if t["assigned_to_user_id"] != u.user_id:
            raise HTTPException(403, "Cannot change others' tasks")
        allowed = {"low": ["medium"], "medium": ["high"], "high": [], "critical": []}
        if body.new_priority not in allowed.get(old_p, []):
            raise HTTPException(403, "Employees can only escalate Low→Medium or Medium→High")
    elif u.role == "team_member":
        if not t.get("is_shared"):
            raise HTTPException(403, "Only shared tasks")
        if body.new_priority == "critical":
            raise HTTPException(403, "Team members cannot set Critical")
    elif u.role == "developer":
        if t.get("type") != "technical":
            raise HTTPException(403, "Developers can only change technical tasks")
    elif u.role in ("supervisor", "hr", "super_admin"):
        pass

    # Update task
    await db.tasks.update_one({"id": tid}, {"$set": {"priority": body.new_priority, "updated_at": now_iso(), "acknowledged_at": None}})
    # Sacrifice tasks
    if body.requires_sacrifice and body.sacrificed_task_ids:
        for sid in body.sacrificed_task_ids:
            await db.tasks.update_one({"id": sid, "company_id": u.company_id}, {"$set": {"priority": "low", "updated_at": now_iso()}})
            await audit(u.company_id, "priority_changed", u.user_id, None, sid, None, {"priority": "low", "reason": f"Deprioritised to accommodate {t['title']}"}, body.reason)
    # Log
    change_id = gen_id()
    await db.priority_changes.insert_one({
        "id": change_id, "company_id": u.company_id, "task_id": tid,
        "changed_by_user_id": u.user_id, "old_priority": old_p, "new_priority": body.new_priority,
        "reason": body.reason, "affected_users": [t["assigned_to_user_id"]], "timestamp": now_iso(),
        "sacrificed_task_ids": body.sacrificed_task_ids,
    })
    await audit(u.company_id, "priority_changed", u.user_id, t["assigned_to_user_id"], tid,
                {"priority": old_p}, {"priority": body.new_priority}, body.reason)
    # Notifications
    msg = f"PRIORITY UPDATE: '{t['title']}' changed from {old_p} → {body.new_priority} by {u.name}. Reason: {body.reason}"
    await notify(u.company_id, t["assigned_to_user_id"], "priority_changed", msg, tid)
    # Conflict alert: multiple criticals
    if body.new_priority == "critical":
        crit_count = await db.tasks.count_documents({"company_id": u.company_id, "assigned_to_user_id": t["assigned_to_user_id"], "priority": "critical", "status": {"$ne": "done"}, "archived": {"$ne": True}})
        if crit_count >= 2:
            # supervisor + hr
            sup_id = (await db.users.find_one({"id": t["assigned_to_user_id"]}, {"_id": 0, "supervisor_id": 1}) or {}).get("supervisor_id")
            if sup_id:
                await notify(u.company_id, sup_id, "conflict_alert", f"Conflict: user has {crit_count} critical tasks simultaneously", tid)
            hrs = await db.users.find({"company_id": u.company_id, "role": "hr"}, {"_id": 0, "id": 1}).to_list(20)
            for h in hrs:
                await notify(u.company_id, h["id"], "conflict_alert", f"Conflict: a user has {crit_count} critical tasks", tid)
    return {"ok": True, "change_id": change_id, "new_priority": body.new_priority}

@api.post("/tasks/{tid}/acknowledge")
async def acknowledge_task(tid: str, u: TokenUser = Depends(current_user)):
    t = await db.tasks.find_one({"id": tid, "company_id": u.company_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Task not found")
    if t["assigned_to_user_id"] != u.user_id:
        raise HTTPException(403, "Not your task")
    await db.tasks.update_one({"id": tid}, {"$set": {"acknowledged_at": now_iso()}})
    return {"ok": True}

@api.post("/tasks/{tid}/archive")
async def archive_task(tid: str, body: ArchiveIn, u: TokenUser = Depends(current_user)):
    if u.role not in ("super_admin","hr","supervisor","developer"):
        raise HTTPException(403, "Not allowed")
    if len(body.reason.strip()) < 5:
        raise HTTPException(400, "Reason required (min 5 chars)")
    t = await db.tasks.find_one({"id": tid, "company_id": u.company_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Task not found")
    if u.role == "developer" and t.get("type") != "technical":
        raise HTTPException(403, "Developers can only archive technical tasks")
    await db.tasks.update_one({"id": tid}, {"$set": {"archived": True, "archive_reason": body.reason, "updated_at": now_iso()}})
    await audit(u.company_id, "task_archived", u.user_id, t["assigned_to_user_id"], tid, None, {"archived": True}, body.reason)
    await notify(u.company_id, t["assigned_to_user_id"], "task_archived", f"Task '{t['title']}' was archived by {u.name}. Reason: {body.reason}", tid)
    return {"ok": True}

@api.post("/tasks/{tid}/restore")
async def restore_task(tid: str, u: TokenUser = Depends(require_roles("super_admin","hr","supervisor"))):
    t = await db.tasks.find_one({"id": tid, "company_id": u.company_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Task not found")
    await db.tasks.update_one({"id": tid}, {"$set": {"archived": False, "updated_at": now_iso()}})
    await audit(u.company_id, "task_restored", u.user_id, t["assigned_to_user_id"], tid, None, {"archived": False})
    return {"ok": True}

@api.get("/tasks-archived")
async def list_archived(u: TokenUser = Depends(require_roles("super_admin","hr","supervisor"))):
    items = await db.tasks.find({"company_id": u.company_id, "archived": True}, {"_id": 0}).to_list(1000)
    return items

# ---------- DAILY UPDATES ----------
@api.post("/daily-updates")
async def submit_daily_update(body: DailyUpdateIn, u: TokenUser = Depends(current_user)):
    today = date.today().isoformat()
    tasks = await db.tasks.find({"company_id": u.company_id, "assigned_to_user_id": u.user_id, "archived": {"$ne": True}}, {"_id": 0}).to_list(500)
    ai = await ai_parse_update(body.raw_message, tasks)
    doc = {
        "id": gen_id(), "company_id": u.company_id, "user_id": u.user_id, "date": today,
        "raw_message": body.raw_message,
        "completed_task_ids": body.completed_task_ids, "in_progress_task_ids": body.in_progress_task_ids,
        "blocker_text": body.blocker_text, "mood_score": body.mood_score or ai["mood_score"],
        "urgency": ai["urgency"], "ai_summary": ai["summary"], "ai_reply": ai["ai_reply"],
        "language": ai["language"], "submitted_at": now_iso(),
    }
    # upsert per (user, date)
    await db.daily_updates.update_one({"company_id": u.company_id, "user_id": u.user_id, "date": today}, {"$set": doc}, upsert=True)
    # mark tasks done/in_progress
    for tid in body.completed_task_ids:
        await db.tasks.update_one({"id": tid, "company_id": u.company_id}, {"$set": {"status": "done", "updated_at": now_iso()}})
    for tid in body.in_progress_task_ids:
        await db.tasks.update_one({"id": tid, "company_id": u.company_id}, {"$set": {"status": "in_progress", "updated_at": now_iso()}})
    # Streak: check if user had update yesterday
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    yest = await db.daily_updates.find_one({"company_id": u.company_id, "user_id": u.user_id, "date": yesterday}, {"_id": 0})
    user_doc = await db.users.find_one({"id": u.user_id}, {"_id": 0})
    new_streak = (user_doc.get("streak_count", 0) + 1) if yest else 1
    badges = set(user_doc.get("badges", []))
    if new_streak >= 7: badges.add("7-day streak")
    if new_streak >= 30: badges.add("30-day streak")
    if new_streak >= 90: badges.add("90-day streak")
    await db.users.update_one({"id": u.user_id}, {"$set": {"streak_count": new_streak, "badges": list(badges)}})
    # Notify supervisor about blocker
    if body.blocker_text:
        sup = user_doc.get("supervisor_id")
        if sup:
            await notify(u.company_id, sup, "blocker_reported", f"{u.name} reported a blocker: {body.blocker_text[:120]}", None)
    return {"ok": True, "ai_reply": ai["ai_reply"], "summary": ai["summary"], "streak": new_streak}

@api.get("/daily-updates")
async def list_daily_updates(u: TokenUser = Depends(current_user), user_id: Optional[str] = None, days: int = 30):
    q = {"company_id": u.company_id}
    if u.role in ("employee", "team_member", "developer"):
        q["user_id"] = u.user_id
    elif u.role == "supervisor":
        team = await db.users.find({"supervisor_id": u.user_id}, {"_id": 0, "id": 1}).to_list(2000)
        q["user_id"] = {"$in": [x["id"] for x in team] + [u.user_id]}
    if user_id and u.role in ("hr", "super_admin", "supervisor"):
        q["user_id"] = user_id
    items = await db.daily_updates.find(q, {"_id": 0}).sort("date", -1).to_list(500)
    return items

# ---------- LEAVES ----------
@api.post("/leaves")
async def request_leave(body: LeaveIn, u: TokenUser = Depends(current_user)):
    lid = gen_id()
    doc = {"id": lid, "company_id": u.company_id, "user_id": u.user_id,
           "start_date": body.start_date, "end_date": body.end_date, "leave_type": body.leave_type,
           "reason": body.reason, "status": "pending", "created_at": now_iso()}
    await db.leaves.insert_one(doc)
    user_doc = await db.users.find_one({"id": u.user_id}, {"_id": 0})
    sup = user_doc.get("supervisor_id")
    if sup:
        await notify(u.company_id, sup, "leave_requested", f"{u.name} requested leave {body.start_date} → {body.end_date}", None)
    doc.pop("_id", None)
    return doc

@api.get("/leaves")
async def list_leaves(u: TokenUser = Depends(current_user)):
    q = {"company_id": u.company_id}
    if u.role == "supervisor":
        team = await db.users.find({"supervisor_id": u.user_id}, {"_id": 0, "id": 1}).to_list(2000)
        q["user_id"] = {"$in": [x["id"] for x in team]}
    elif u.role in ("employee", "team_member", "developer"):
        q["user_id"] = u.user_id
    items = await db.leaves.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return items

@api.post("/leaves/{lid}/approve")
async def approve_leave(lid: str, body: LeaveApproveIn, u: TokenUser = Depends(require_roles("supervisor","hr","super_admin"))):
    leave = await db.leaves.find_one({"id": lid, "company_id": u.company_id}, {"_id": 0})
    if not leave:
        raise HTTPException(404, "Leave not found")
    await db.leaves.update_one({"id": lid}, {"$set": {"status": "approved" if body.approved else "rejected", "approved_by": u.user_id, "approval_note": body.note}})
    await notify(u.company_id, leave["user_id"], "leave_decision", f"Your leave request was {'approved' if body.approved else 'rejected'} by {u.name}", None)
    return {"ok": True}

# ---------- NOTIFICATIONS ----------
@api.get("/notifications")
async def list_notifications(u: TokenUser = Depends(current_user)):
    items = await db.notifications.find({"company_id": u.company_id, "user_id": u.user_id}, {"_id": 0}).sort("created_at", -1).limit(200).to_list(200)
    return items

@api.post("/notifications/{nid}/read")
async def mark_notification_read(nid: str, u: TokenUser = Depends(current_user)):
    await db.notifications.update_one({"id": nid, "user_id": u.user_id}, {"$set": {"read": True}})
    return {"ok": True}

@api.post("/notifications/read-all")
async def mark_all_read(u: TokenUser = Depends(current_user)):
    await db.notifications.update_many({"user_id": u.user_id, "company_id": u.company_id}, {"$set": {"read": True}})
    return {"ok": True}

# ---------- AUDIT LOG ----------
@api.get("/audit-log")
async def list_audit(u: TokenUser = Depends(current_user), action: Optional[str] = None, user_id: Optional[str] = None, limit: int = 200):
    q = {"company_id": u.company_id}
    if u.role == "employee":
        # only their own tasks
        my_tasks = await db.tasks.find({"company_id": u.company_id, "assigned_to_user_id": u.user_id}, {"_id": 0, "id": 1}).to_list(2000)
        q["task_id"] = {"$in": [t["id"] for t in my_tasks]}
    elif u.role == "supervisor":
        team = await db.users.find({"supervisor_id": u.user_id}, {"_id": 0, "id": 1}).to_list(2000)
        q["$or"] = [{"target_user_id": {"$in": [x["id"] for x in team] + [u.user_id]}}, {"performed_by_user_id": u.user_id}]
    if action: q["action_type"] = action
    if user_id and u.role in ("hr", "super_admin"):
        q["$or"] = [{"performed_by_user_id": user_id}, {"target_user_id": user_id}]
    items = await db.audit_log.find(q, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    def _scrub(v):
        if isinstance(v, dict): return {k: _scrub(x) for k, x in v.items() if k != "_id"}
        if isinstance(v, list): return [_scrub(x) for x in v]
        try:
            from bson import ObjectId
            if isinstance(v, ObjectId): return str(v)
        except Exception: pass
        return v
    return [_scrub(i) for i in items]

# ---------- DASHBOARDS ----------
@api.get("/dashboard/summary")
async def dashboard_summary(u: TokenUser = Depends(current_user)):
    cid = u.company_id
    today = date.today().isoformat()
    # role-scoped task counts
    base = {"company_id": cid, "archived": {"$ne": True}}
    if u.role == "supervisor":
        team = await db.users.find({"supervisor_id": u.user_id}, {"_id": 0, "id": 1}).to_list(2000)
        ids = [x["id"] for x in team] + [u.user_id]
        base["assigned_to_user_id"] = {"$in": ids}
    elif u.role in ("employee", "team_member"):
        base["$or"] = [{"assigned_to_user_id": u.user_id}, {"shared_with_user_ids": u.user_id}]
    elif u.role == "developer":
        base["$or"] = [{"type": "technical"}, {"assigned_to_user_id": u.user_id}]

    open_tasks = await db.tasks.count_documents({**base, "status": {"$ne": "done"}})
    critical = await db.tasks.count_documents({**base, "priority": "critical", "status": {"$ne": "done"}})
    high = await db.tasks.count_documents({**base, "priority": "high", "status": {"$ne": "done"}})
    done_today_q = {**base, "status": "done"}
    done = await db.tasks.count_documents(done_today_q)
    updates_today = await db.daily_updates.count_documents({"company_id": cid, "date": today})
    on_leave_today = await db.leaves.count_documents({"company_id": cid, "status": "approved", "start_date": {"$lte": today}, "end_date": {"$gte": today}})
    # avg mood today
    ups = await db.daily_updates.find({"company_id": cid, "date": today}, {"_id": 0, "mood_score": 1}).to_list(500)
    avg_mood = round(sum([x.get("mood_score", 3) for x in ups]) / len(ups), 2) if ups else 0
    # blockers
    blockers = await db.daily_updates.count_documents({"company_id": cid, "date": today, "blocker_text": {"$nin": [None, ""]}})
    return {
        "open_tasks": open_tasks, "critical": critical, "high": high, "done_total": done,
        "updates_today": updates_today, "avg_mood_today": avg_mood, "blockers_today": blockers,
        "on_leave_today": on_leave_today,
    }

@api.get("/dashboard/digest")
async def dashboard_digest(u: TokenUser = Depends(require_roles("hr","super_admin","supervisor"))):
    text = await ai_digest(u.company_id)
    return {"digest": text, "generated_at": now_iso()}

@api.get("/dashboard/leaderboard")
async def leaderboard(u: TokenUser = Depends(current_user)):
    # weekly: count tasks done in last 7 days per user
    cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    pipeline = [
        {"$match": {"company_id": u.company_id, "status": "done", "updated_at": {"$gte": cutoff}}},
        {"$group": {"_id": "$assigned_to_user_id", "completed": {"$sum": 1}}},
        {"$sort": {"completed": -1}},
        {"$limit": 10},
    ]
    rows = await db.tasks.aggregate(pipeline).to_list(10)
    out = []
    for r in rows:
        usr = await db.users.find_one({"id": r["_id"]}, {"_id": 0, "name": 1, "id": 1, "streak_count": 1, "role": 1, "badges": 1})
        if usr:
            out.append({**usr, "completed": r["completed"]})
    return out

# ---------- OBJECT STORAGE (Emergent managed) ----------
def init_storage() -> Optional[str]:
    global storage_key
    if storage_key:
        return storage_key
    if not EMERGENT_LLM_KEY:
        return None
    try:
        r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY}, timeout=15)
        r.raise_for_status()
        storage_key = r.json()["storage_key"]
        log.info("Object storage initialised")
        return storage_key
    except Exception as e:
        log.warning(f"Storage init failed: {e}")
        return None

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise HTTPException(503, "Storage not initialised")
    r = requests.put(f"{STORAGE_URL}/objects/{path}",
                     headers={"X-Storage-Key": key, "Content-Type": content_type},
                     data=data, timeout=120)
    r.raise_for_status()
    return r.json()

def get_object(path: str):
    key = init_storage()
    if not key:
        raise HTTPException(503, "Storage not initialised")
    r = requests.get(f"{STORAGE_URL}/objects/{path}",
                     headers={"X-Storage-Key": key}, timeout=60)
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")

MIME_BY_EXT = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
               "pdf": "application/pdf", "gif": "image/gif", "webp": "image/webp"}

@api.post("/files/upload")
async def upload_file(file: UploadFile = File(...), task_id: Optional[str] = Query(None),
                      daily_update_date: Optional[str] = Query(None),
                      u: TokenUser = Depends(current_user)):
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(400, "File exceeds 5MB")
    ext = (file.filename or "bin").rsplit(".", 1)[-1].lower()
    if ext not in MIME_BY_EXT:
        raise HTTPException(400, f"Unsupported file type .{ext} — allowed: jpg/png/pdf/gif/webp")
    fid = gen_id()
    path = f"{APP_NAME}/{u.company_id}/{u.user_id}/{fid}.{ext}"
    result = put_object(path, data, MIME_BY_EXT[ext])
    doc = {
        "id": fid, "company_id": u.company_id, "user_id": u.user_id,
        "storage_path": result["path"], "original_filename": file.filename,
        "content_type": MIME_BY_EXT[ext], "size": result.get("size", len(data)),
        "task_id": task_id, "daily_update_date": daily_update_date,
        "is_deleted": False, "created_at": now_iso(),
    }
    await db.attachments.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.get("/files/{file_id}")
async def serve_file(file_id: str, auth: Optional[str] = Query(None),
                     authorization: Optional[str] = Header(None)):
    # Authenticate via header OR ?auth=token (for <img src>)
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
    elif auth:
        token = auth
    if not token:
        raise HTTPException(401, "Missing token")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid token")
    rec = await db.attachments.find_one({"id": file_id, "is_deleted": False}, {"_id": 0})
    if not rec or rec["company_id"] != payload["company_id"]:
        raise HTTPException(404, "Not found")
    data, ct = get_object(rec["storage_path"])
    return Response(content=data, media_type=rec.get("content_type", ct))

@api.get("/files")
async def list_files(u: TokenUser = Depends(current_user), task_id: Optional[str] = None,
                     daily_update_date: Optional[str] = None):
    q = {"company_id": u.company_id, "is_deleted": False}
    if task_id: q["task_id"] = task_id
    if daily_update_date: q["daily_update_date"] = daily_update_date
    if u.role in ("employee", "team_member", "developer"):
        q["user_id"] = u.user_id
    items = await db.attachments.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items

@api.delete("/files/{file_id}")
async def delete_file(file_id: str, u: TokenUser = Depends(current_user)):
    rec = await db.attachments.find_one({"id": file_id, "company_id": u.company_id}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "Not found")
    if rec["user_id"] != u.user_id and u.role not in ("hr", "super_admin", "supervisor"):
        raise HTTPException(403, "Not allowed")
    await db.attachments.update_one({"id": file_id}, {"$set": {"is_deleted": True}})
    return {"ok": True}

# ---------- TELEGRAM BOT (live once TELEGRAM_BOT_TOKEN env set) ----------
class TelegramLinkIn(BaseModel):
    telegram_id: Optional[str] = None  # backward compat: legacy field
    telegram_username: Optional[str] = None  # @handle (without or with @)
    telegram_chat_id: Optional[str] = None  # numeric chat_id

@api.post("/telegram/link")
async def link_telegram(body: TelegramLinkIn, u: TokenUser = Depends(current_user)):
    """Link Telegram identity to current user. Accepts username and/or numeric chat_id.
    `telegram_id` (legacy) is treated as username if it starts with '@', else as chat_id."""
    updates: Dict[str, Any] = {}
    if body.telegram_username:
        updates["telegram_username"] = _norm_tg_username(body.telegram_username)
    if body.telegram_chat_id:
        updates["telegram_chat_id"] = str(body.telegram_chat_id).strip()
    if body.telegram_id:
        v = body.telegram_id.strip()
        if v.startswith("@"):
            updates["telegram_username"] = _norm_tg_username(v)
        elif v.lstrip("-").isdigit():
            updates["telegram_chat_id"] = v
        else:
            # Keep raw on legacy field for visibility
            updates["telegram_id"] = v
    if not updates:
        raise HTTPException(400, "Provide telegram_username and/or telegram_chat_id")
    await db.users.update_one({"id": u.user_id}, {"$set": updates})
    return {"ok": True, "updated": updates}

def _norm_tg_username(u: str) -> str:
    """Normalise '@QuestSong' / 'QuestSong' → '@questsong' (lowercase, leading @)."""
    if not u: return u
    u = u.strip()
    if not u.startswith("@"):
        u = "@" + u
    return u.lower()

def _tg_chat_id_of(user: dict) -> Optional[str]:
    """Return the best chat_id we have for a user (numeric preferred)."""
    cid = user.get("telegram_chat_id") or user.get("telegram_id")
    if not cid:
        return None
    cid = str(cid).strip()
    return cid if (cid.lstrip("-").isdigit() or cid.startswith("@")) else None

def tg_send(chat_id: str, text: str) -> bool:
    """Send a Telegram message. chat_id must be numeric — fail silently for usernames/phones."""
    if not TELEGRAM_BOT_TOKEN:
        log.info(f"[TG MOCK] → {chat_id}: {text[:120]}")
        return False
    if not chat_id:
        return False
    cid = str(chat_id).strip()
    # Bot API requires numeric chat_id for private users (or @channel for channels)
    if not (cid.lstrip("-").isdigit() or cid.startswith("@")):
        log.info(f"[TG SKIP] non-numeric chat_id '{cid}' — waiting for /start to capture it")
        return False
    try:
        r = requests.post(f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                          json={"chat_id": cid, "text": text, "parse_mode": "Markdown"},
                          timeout=10)
        return r.status_code == 200
    except Exception as e:
        log.warning(f"TG send failed: {e}")
        return False

async def _tg_handle_command(user: dict, text: str) -> str:
    """Returns the reply text. Handles role-aware commands."""
    cmd = text.strip().lower()
    # Normalise slash commands → keyword form
    SLASH_MAP = {
        "/tasks": "my tasks", "/task": "my tasks", "/mytasks": "my tasks",
        "/acknowledge": "acknowledge", "/ack": "acknowledge",
        "/leave": "leave tomorrow", "/teamstatus": "team status",
        "/teammood": "team mood today", "/pendingleaves": "pending leaves",
        "/criticaltasks": "critical tasks",
    }
    # Special: /newtask handled below — keep raw, do NOT map it
    if raw_command := text.strip().split()[0].lower() if text.strip() else "":
        if raw_command in ("/newtask", "/task") and len(text.strip().split()) > 1:
            pass  # will be handled by NEW_PREFIXES below
        elif cmd in SLASH_MAP:
            cmd = SLASH_MAP[cmd]
    else:
        if cmd in SLASH_MAP:
            cmd = SLASH_MAP[cmd]
    role = user["role"]
    cid = user["company_id"]
    name = user["name"]

    if cmd in ("/start", "start", "hi", "hello"):
        return (f"Hi {name}! I'm your WorkLog assistant. Try:\n"
                "• /tasks — list your open tasks\n"
                "• /newtask <title> — add a new task (or 'new task: review Q4 budget by Friday, high')\n"
                "• /acknowledge — acknowledge a critical task\n"
                "• /leave — request leave for tomorrow\n"
                "• Or just describe your day in any language and I'll log it.")

    # ── NEW TASK creation ──
    NEW_PREFIXES = ("/newtask ", "/newtask\n", "/task ", "/task\n",
                    "new task:", "newtask:", "add task:", "create task:", "task:")
    raw = text.strip()
    raw_low = raw.lower()
    prefix_hit = None
    for p in NEW_PREFIXES:
        if raw_low.startswith(p):
            prefix_hit = p; break
    if cmd in ("/newtask", "/task", "newtask", "new task", "add task"):
        return ("To add a task send:\n`/newtask Review Q4 budget by Friday, high priority`\n"
                "Or simply: `new task: prep slides for Monday`")
    if prefix_hit:
        # Strip the prefix from the original text (preserve case)
        body_text = raw[len(prefix_hit):].strip()
        if not body_text:
            return "Please include a title — e.g. `/newtask Prep deck for Monday`"
        # Role gating mirrors POST /api/tasks
        if role == "team_member":
            return "Team Members can only create *shared* tasks. Please use the web app for that."
        # Try AI extraction; fall back to plain title
        title, priority, due_iso, task_type = body_text, "medium", None, "general"
        ai_out = None
        try:
            ai_out = await asyncio.to_thread(
                _gemini_call,
                ("You extract task fields from one short message. Return strict JSON with keys: "
                 "title (string), priority (low|medium|high|critical, default medium), "
                 "due_date_iso (YYYY-MM-DD or null), task_type (technical|operational|hr|general, default general). "
                 "If user says 'tomorrow' use tomorrow's date in ISO. Reply ONLY JSON."),
                f"Today is {date.today().isoformat()}. Message: {body_text}",
            )
        except Exception:
            ai_out = None
        if ai_out:
            t = ai_out.strip()
            if t.startswith("```"):
                parts = t.split("```")
                if len(parts) >= 2:
                    t = parts[1]
                    if t.startswith("json"): t = t[4:]
                    t = t.strip()
            try:
                data = json.loads(t)
                title = (data.get("title") or body_text).strip()
                pr = (data.get("priority") or "medium").lower()
                if pr in ("low","medium","high","critical"):
                    priority = pr
                due_iso = data.get("due_date_iso")
                tt = (data.get("task_type") or "general").lower()
                if tt in ("technical","operational","hr","general"):
                    task_type = tt
            except Exception:
                pass
        # Employee cannot self-set Critical
        if role == "employee" and priority == "critical":
            priority = "high"
        # Developer constraint: only technical tasks
        if role == "developer" and task_type != "technical":
            task_type = "technical"
        tid = gen_id()
        doc = {
            "id": tid, "company_id": cid,
            "title": title, "description": "",
            "assigned_to_user_id": user["id"], "created_by_user_id": user["id"],
            "team_id": user.get("team_id"),
            "status": "todo", "priority": priority, "type": task_type,
            "due_date": (datetime.fromisoformat(due_iso).isoformat() if due_iso else None),
            "is_recurring": False, "recurrence_rule": None,
            "is_shared": False, "shared_with_user_ids": [],
            "blocker_text": None, "acknowledged_at": None, "archived": False,
            "created_at": now_iso(), "updated_at": now_iso(),
        }
        await db.tasks.insert_one(doc)
        await db.audit_log.insert_one({
            "id": gen_id(), "company_id": cid, "action_type": "task_created",
            "performed_by_user_id": user["id"], "target_user_id": user["id"], "task_id": tid,
            "old_value": None, "new_value": {"title": title, "priority": priority, "via": "telegram"},
            "reason": None, "timestamp": now_iso(),
        })
        due_str = f" · due {due_iso}" if due_iso else ""
        return (f"✅ Task created\n"
                f"*{title}*\n"
                f"Priority: `{priority.upper()}` · Type: `{task_type}`{due_str}\n"
                "Send /tasks to see your full list.")

    if cmd in ("my tasks", "/tasks", "tasks"):
        tasks = await db.tasks.find({"company_id": cid, "assigned_to_user_id": user["id"],
                                      "archived": {"$ne": True}, "status": {"$ne": "done"}},
                                     {"_id": 0}).sort("priority", 1).to_list(20)
        if not tasks: return "You have no open tasks. Enjoy the break ☕"
        order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        tasks.sort(key=lambda t: order.get(t["priority"], 4))
        lines = [f"*Your open tasks ({len(tasks)}):*"]
        for t in tasks[:10]:
            lines.append(f"• [{t['priority'].upper()}] {t['title']}")
        return "\n".join(lines)

    if cmd in ("acknowledge", "ack"):
        crit = await db.tasks.find_one({"company_id": cid, "assigned_to_user_id": user["id"],
                                         "priority": "critical", "status": {"$ne": "done"},
                                         "acknowledged_at": None}, {"_id": 0})
        if not crit: return "No unacknowledged critical tasks."
        await db.tasks.update_one({"id": crit["id"]}, {"$set": {"acknowledged_at": now_iso()}})
        return f"✅ Acknowledged: {crit['title']}"

    if "leave" in cmd and role in ("employee","team_member","developer","supervisor"):
        # quick leave register for tomorrow
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        lid = gen_id()
        await db.leaves.insert_one({"id": lid, "company_id": cid, "user_id": user["id"],
                                     "start_date": tomorrow, "end_date": tomorrow,
                                     "leave_type": "personal", "reason": text,
                                     "status": "pending", "created_at": now_iso()})
        sup_id = user.get("supervisor_id")
        if sup_id:
            await db.notifications.insert_one({"id": gen_id(), "company_id": cid, "user_id": sup_id,
                                                "type": "leave_requested", "read": False,
                                                "message": f"{name} requested leave for {tomorrow} via Telegram",
                                                "related_task_id": None, "created_at": now_iso()})
        return f"Leave request submitted for {tomorrow}. Awaiting supervisor approval."

    if role in ("supervisor", "hr", "super_admin") and "team status" in cmd:
        today_ = date.today().isoformat()
        if role == "supervisor":
            team = await db.users.find({"supervisor_id": user["id"]}, {"_id": 0, "id": 1, "name": 1}).to_list(200)
        else:
            team = await db.users.find({"company_id": cid, "role": {"$nin": ["super_admin"]}}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
        ups = await db.daily_updates.find({"company_id": cid, "date": today_,
                                            "user_id": {"$in": [t["id"] for t in team]}},
                                           {"_id": 0}).to_list(500)
        upd_ids = {u["user_id"] for u in ups}
        avg = round(sum([u.get("mood_score",3) for u in ups])/len(ups), 2) if ups else 0
        return f"*Team status today:*\nMembers: {len(team)}\nUpdates submitted: {len(ups)}\nAvg mood: {avg}/5\nMissing: {len(team)-len(upd_ids)}"

    if role in ("hr", "super_admin") and "team mood" in cmd:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).date().isoformat()
        ups = await db.daily_updates.find({"company_id": cid, "date": {"$gte": cutoff}},
                                           {"_id": 0}).to_list(1000)
        if not ups: return "No mood data in last 7 days."
        avg = round(sum([u.get("mood_score",3) for u in ups])/len(ups), 2)
        low = [u for u in ups if u.get("mood_score", 3) <= 2]
        return f"*7-day mood:* avg {avg}/5 across {len(ups)} updates. Low-mood entries: {len(low)}"

    if role in ("hr", "super_admin") and "pending leaves" in cmd:
        leaves = await db.leaves.find({"company_id": cid, "status": "pending"}, {"_id": 0}).to_list(100)
        if not leaves: return "No pending leave requests."
        lines = ["*Pending leave requests:*"]
        for l in leaves[:10]:
            usr = await db.users.find_one({"id": l["user_id"]}, {"_id": 0, "name": 1}) or {}
            lines.append(f"• {usr.get('name','?')}: {l['start_date']} → {l['end_date']}")
        return "\n".join(lines)

    if role in ("supervisor", "hr", "super_admin") and "critical tasks" in cmd:
        crits = await db.tasks.find({"company_id": cid, "priority": "critical",
                                      "status": {"$ne": "done"}, "archived": {"$ne": True}},
                                     {"_id": 0}).to_list(50)
        if not crits: return "No critical tasks right now. 🎉"
        lines = [f"*{len(crits)} critical tasks:*"]
        for t in crits[:10]:
            assignee = await db.users.find_one({"id": t["assigned_to_user_id"]}, {"_id": 0, "name": 1}) or {}
            lines.append(f"• {t['title']} → {assignee.get('name','?')}")
        return "\n".join(lines)

    # Default: free-text daily update → parse via AI
    tasks = await db.tasks.find({"company_id": cid, "assigned_to_user_id": user["id"],
                                  "archived": {"$ne": True}}, {"_id": 0}).to_list(50)
    ai = await ai_parse_update(text, tasks)
    today_ = date.today().isoformat()
    await db.daily_updates.update_one(
        {"company_id": cid, "user_id": user["id"], "date": today_},
        {"$set": {"id": gen_id(), "company_id": cid, "user_id": user["id"], "date": today_,
                  "raw_message": text, "mood_score": ai["mood_score"], "urgency": ai["urgency"],
                  "ai_summary": ai["summary"], "ai_reply": ai["ai_reply"], "language": ai["language"],
                  "submitted_at": now_iso(), "completed_task_ids": [], "in_progress_task_ids": []}},
        upsert=True)
    return ai["ai_reply"]

@api.post("/telegram/webhook")
async def telegram_webhook(req: Request):
    """Telegram inbound updates. Auto-captures numeric chat_id when a known-username user sends /start."""
    body = await req.json()
    msg = body.get("message") or body.get("edited_message") or {}
    chat = msg.get("chat") or {}
    frm = msg.get("from") or {}
    chat_id = str(chat.get("id", "")) if chat.get("id") is not None else ""
    username_raw = frm.get("username") or chat.get("username") or ""
    username = _norm_tg_username(username_raw) if username_raw else ""
    text = msg.get("text", "")
    if not chat_id or not text:
        return {"ok": True, "ignored": True}

    # 1) Look up by numeric chat_id
    user = await db.users.find_one({"telegram_chat_id": chat_id}, {"_id": 0})
    auto_captured = False

    # 2) Fall back to legacy telegram_id storing the numeric id
    if not user:
        user = await db.users.find_one({"telegram_id": chat_id}, {"_id": 0})
        if user:
            # Migrate: also write to telegram_chat_id
            await db.users.update_one({"id": user["id"]}, {"$set": {"telegram_chat_id": chat_id}})
            user["telegram_chat_id"] = chat_id

    # 3) Auto-capture: look up by username and bind numeric chat_id
    if not user and username:
        user = await db.users.find_one(
            {"$or": [
                {"telegram_username": username},
                {"telegram_id": username},  # legacy field may hold "@handle"
            ]},
            {"_id": 0},
        )
        if user:
            await db.users.update_one(
                {"id": user["id"]},
                {"$set": {"telegram_chat_id": chat_id, "telegram_username": username}},
            )
            user["telegram_chat_id"] = chat_id
            user["telegram_username"] = username
            auto_captured = True
            log.info(f"[TG AUTO-LINK] @{username_raw} → chat_id {chat_id} → user {user.get('email')}")

    if not user:
        tg_send(
            chat_id,
            "Hi! I don't recognise this Telegram account yet.\n\n"
            "1. Open the WorkLog app → History/Profile page\n"
            f"2. Set your Telegram username to *@{username_raw}* (or paste this chat id: `{chat_id}`)\n"
            "3. Then send /start again — I'll bind automatically."
        )
        return {"ok": True, "unlinked": True, "captured_username": username_raw, "chat_id": chat_id}

    # If auto-captured + this is /start, send a friendly welcome
    cmd = text.strip().lower()
    if auto_captured and cmd in ("/start", "start", "hi", "hello"):
        welcome = (
            f"✅ Telegram linked, {user['name']}! Your numeric chat id is `{chat_id}`.\n\n"
            "Try these commands:\n"
            "• /tasks — your open tasks\n"
            "• /newtask <title> — add a new task (e.g. `/newtask Prep deck by Friday, high`)\n"
            "• /acknowledge — acknowledge a critical task\n"
            "• /leave — request leave for tomorrow\n"
            "• Or just type your daily update in any language."
        )
        lang = user.get("language", "en")
        if lang != "en":
            welcome = await tg_translate_reply(welcome, lang)
        tg_send(chat_id, welcome)
        return {"ok": True, "auto_linked": True, "chat_id": chat_id, "user_email": user.get("email")}

    try:
        reply = await _tg_handle_command(user, text)
    except Exception as e:
        log.exception("TG handler error")
        reply = "Sorry — something went wrong on my side."
    lang = user.get("language", "en")
    if lang and lang != "en":
        reply = await tg_translate_reply(reply, lang)
    tg_send(chat_id, reply)
    return {"ok": True, "mocked": not bool(TELEGRAM_BOT_TOKEN), "auto_linked": auto_captured}

# ---------- MAKE.COM CRON ENDPOINTS ----------
def _require_make_secret(secret: str):
    if not secret or secret != MAKE_WEBHOOK_SECRET:
        raise HTTPException(401, "Invalid Make.com webhook secret")

@api.post("/cron/generate-digest")
async def cron_generate_digest(company_id: Optional[str] = Query(None), secret: str = Query(...), req: Request = None):
    """Called by Make.com. Two modes:
    1. Legacy: ?company_id=...&secret=... → digest for one company.
    2. Timezone mode: secret + body {"timezone": "Asia/Kolkata"} → digest for every company that has at least one HR/super_admin in that timezone, delivered to those HRs.
    """
    _require_make_secret(secret)
    tz = None
    try:
        if req:
            body = await req.json()
            tz = body.get("timezone")
    except Exception:
        tz = None

    if tz:
        # Find HRs in this timezone
        hr_users = await db.users.find({"timezone": tz, "role": {"$in": ["hr", "super_admin"]}, "active": True},
                                        {"_id": 0, "id": 1, "name": 1, "company_id": 1, "telegram_id": 1, "telegram_chat_id": 1, "telegram_username": 1, "email": 1}).to_list(500)
        if not hr_users:
            return {"ok": True, "timezone": tz, "hr_users_matched": 0, "results": []}
        results = []
        by_company: Dict[str, list] = {}
        for h in hr_users:
            by_company.setdefault(h["company_id"], []).append(h)
        for cid, hrs in by_company.items():
            company = await db.companies.find_one({"id": cid}, {"_id": 0, "name": 1}) or {"name": "?"}
            text = await ai_digest(cid)
            for h in hrs:
                await db.notifications.insert_one({"id": gen_id(), "company_id": cid, "user_id": h["id"],
                                                    "type": "daily_digest", "message": text, "read": False,
                                                    "related_task_id": None, "created_at": now_iso()})
                if h.get("telegram_id"):
                    tg_send(_tg_chat_id_of(h), f"*Daily Digest — {company['name']}*\n\n{text}")
            _push_to_make(MAKE_DIGEST_WEBHOOK_URL, {
                "type": "daily_digest", "company_id": cid, "company_name": company["name"],
                "timezone": tz, "digest": text,
                "hr_recipients": [{"name": h["name"], "email": h.get("email"), "telegram_id": h.get("telegram_id")} for h in hrs],
                "generated_at": now_iso(),
            })
            results.append({"company": company["name"], "hr_count": len(hrs), "digest_chars": len(text)})
        return {"ok": True, "timezone": tz, "companies": len(by_company), "hr_users_matched": len(hr_users), "results": results}

    # Legacy single-company mode
    if not company_id:
        raise HTTPException(400, "company_id required when no timezone provided")
    text = await ai_digest(company_id)
    hrs = await db.users.find({"company_id": company_id, "role": {"$in": ["hr", "super_admin"]}}, {"_id": 0, "id": 1, "name": 1, "telegram_id": 1, "telegram_chat_id": 1, "telegram_username": 1, "email": 1}).to_list(50)
    for h in hrs:
        await db.notifications.insert_one({"id": gen_id(), "company_id": company_id, "user_id": h["id"],
                                            "type": "daily_digest", "message": text, "read": False,
                                            "related_task_id": None, "created_at": now_iso()})
        if h.get("telegram_id"):
            tg_send(_tg_chat_id_of(h), f"*Daily Digest*\n\n{text}")
    _push_to_make(MAKE_DIGEST_WEBHOOK_URL, {
        "type": "daily_digest", "company_id": company_id, "digest": text,
        "hr_recipients": [{"name": h["name"], "email": h.get("email"), "telegram_id": h.get("telegram_id"), "telegram_chat_id": h.get("telegram_chat_id"), "telegram_username": h.get("telegram_username")} for h in hrs],
        "generated_at": now_iso(),
    })
    return {"digest": text, "delivered_to": len(hrs)}

def _push_to_make(url: str, payload: dict) -> bool:
    if not url:
        return False
    try:
        r = requests.post(url, json=payload, timeout=15)
        return r.status_code < 400
    except Exception as e:
        log.warning(f"Make.com push failed: {e}")
        return False

async def _run_digest_for_all_companies():
    """Internal helper: generate digest per company and push to Make.com webhook."""
    companies = await db.companies.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)
    results = []
    for c in companies:
        try:
            text = await ai_digest(c["id"])
            hrs = await db.users.find({"company_id": c["id"], "role": "hr"}, {"_id": 0, "id": 1, "name": 1, "telegram_id": 1, "telegram_chat_id": 1, "telegram_username": 1, "email": 1}).to_list(50)
            for h in hrs:
                await db.notifications.insert_one({"id": gen_id(), "company_id": c["id"], "user_id": h["id"],
                                                    "type": "daily_digest", "message": text, "read": False,
                                                    "related_task_id": None, "created_at": now_iso()})
                if h.get("telegram_id"):
                    tg_send(_tg_chat_id_of(h), f"*Daily Digest — {c['name']}*\n\n{text}")
            _push_to_make(MAKE_DIGEST_WEBHOOK_URL, {
                "type": "daily_digest", "company_id": c["id"], "company_name": c["name"],
                "digest": text, "hr_recipients": [{"name": h["name"], "email": h.get("email"), "telegram_id": h.get("telegram_id")} for h in hrs],
                "generated_at": now_iso(),
            })
            results.append({"company": c["name"], "ok": True})
        except Exception as e:
            log.exception(f"Digest failed for {c['id']}")
            results.append({"company": c["name"], "ok": False, "error": str(e)})
    return results

async def _run_weekly_pdf_for_all_companies():
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas
    from reportlab.lib.units import cm
    companies = await db.companies.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)
    results = []
    for c in companies:
        try:
            cid = c["id"]
            cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).date().isoformat()
            ups = await db.daily_updates.find({"company_id": cid, "date": {"$gte": cutoff}}, {"_id": 0}).to_list(2000)
            tasks_done = await db.tasks.count_documents({"company_id": cid, "status": "done", "updated_at": {"$gte": cutoff}})
            blockers = sum(1 for u in ups if u.get("blocker_text"))
            avg_mood = round(sum([u.get("mood_score",3) for u in ups])/len(ups), 2) if ups else 0
            buf = io.BytesIO()
            cv = canvas.Canvas(buf, pagesize=A4); w, h = A4; y = h - 2*cm
            cv.setFont("Helvetica-Bold", 18); cv.drawString(2*cm, y, f"{c['name']} — Weekly Report"); y -= 1*cm
            cv.setFont("Helvetica", 10); cv.drawString(2*cm, y, f"Week ending {date.today().isoformat()}"); y -= 1.2*cm
            cv.setFont("Helvetica-Bold", 12); cv.drawString(2*cm, y, "Summary"); y -= 0.7*cm
            cv.setFont("Helvetica", 11)
            for line in [f"Daily updates submitted: {len(ups)}",
                         f"Tasks completed: {tasks_done}",
                         f"Blockers reported: {blockers}",
                         f"Average mood (1-5): {avg_mood}"]:
                cv.drawString(2.3*cm, y, line); y -= 0.6*cm
            digest = await ai_digest(cid)
            y -= 0.4*cm
            cv.setFont("Helvetica-Bold", 12); cv.drawString(2*cm, y, "AI digest"); y -= 0.7*cm
            cv.setFont("Helvetica", 10)
            for chunk in [digest[i:i+95] for i in range(0, len(digest), 95)]:
                cv.drawString(2.3*cm, y, chunk); y -= 0.5*cm
                if y < 3*cm: break
            cv.showPage(); cv.save()
            pdf_bytes = buf.getvalue()
            path = f"{APP_NAME}/{cid}/reports/{date.today().isoformat()}-{gen_id()[:8]}.pdf"
            result = put_object(path, pdf_bytes, "application/pdf")
            fid = gen_id()
            await db.attachments.insert_one({
                "id": fid, "company_id": cid, "user_id": "system",
                "storage_path": result["path"], "original_filename": f"weekly-report-{date.today().isoformat()}.pdf",
                "content_type": "application/pdf", "size": len(pdf_bytes),
                "task_id": None, "daily_update_date": None,
                "is_deleted": False, "created_at": now_iso(), "report": True,
            })
            file_url = f"{PUBLIC_BASE_URL}/api/files/{fid}" if PUBLIC_BASE_URL else f"/api/files/{fid}"
            hrs = await db.users.find({"company_id": cid, "role": "hr"}, {"_id": 0, "id": 1, "name": 1, "telegram_id": 1, "telegram_chat_id": 1, "telegram_username": 1, "email": 1}).to_list(50)
            for hr_u in hrs:
                await db.notifications.insert_one({"id": gen_id(), "company_id": cid, "user_id": hr_u["id"],
                                                    "type": "weekly_report", "read": False,
                                                    "message": f"Weekly PDF report ready",
                                                    "related_task_id": None, "created_at": now_iso()})
                if hr_u.get("telegram_id"):
                    tg_send(_tg_chat_id_of(hr_u), f"Weekly report ready 📊\n{file_url}")
            _push_to_make(MAKE_WEEKLY_PDF_WEBHOOK_URL, {
                "type": "weekly_pdf", "company_id": cid, "company_name": c["name"],
                "file_id": fid, "file_url": file_url, "size_bytes": len(pdf_bytes),
                "stats": {"updates": len(ups), "tasks_done": tasks_done, "blockers": blockers, "avg_mood": avg_mood},
                "hr_recipients": [{"name": hr_u["name"], "email": hr_u.get("email"), "telegram_id": hr_u.get("telegram_id")} for hr_u in hrs],
                "generated_at": now_iso(),
            })
            results.append({"company": c["name"], "ok": True, "file_id": fid})
        except Exception as e:
            log.exception(f"Weekly PDF failed for {c.get('id')}")
            results.append({"company": c.get("name"), "ok": False, "error": str(e)})
    return results

@api.post("/admin/run-digest-now")
async def admin_run_digest(u: TokenUser = Depends(require_roles("super_admin", "hr"))):
    """Manually trigger digest for this company (testing helper)."""
    text = await ai_digest(u.company_id)
    company = await db.companies.find_one({"id": u.company_id}, {"_id": 0, "name": 1}) or {"name": "?"}
    hrs = await db.users.find({"company_id": u.company_id, "role": "hr"}, {"_id": 0, "id": 1, "name": 1, "telegram_id": 1, "telegram_chat_id": 1, "telegram_username": 1, "email": 1}).to_list(50)
    for h in hrs:
        await db.notifications.insert_one({"id": gen_id(), "company_id": u.company_id, "user_id": h["id"],
                                            "type": "daily_digest", "message": text, "read": False,
                                            "related_task_id": None, "created_at": now_iso()})
        if h.get("telegram_id"):
            tg_send(_tg_chat_id_of(h), f"*Daily Digest*\n\n{text}")
    pushed = _push_to_make(MAKE_DIGEST_WEBHOOK_URL, {
        "type": "daily_digest", "company_id": u.company_id, "company_name": company["name"],
        "digest": text, "hr_recipients": [{"name": h["name"], "email": h.get("email"), "telegram_id": h.get("telegram_id"), "telegram_chat_id": h.get("telegram_chat_id"), "telegram_username": h.get("telegram_username")} for h in hrs],
        "generated_at": now_iso(),
    })
    return {"digest": text, "make_pushed": pushed, "hr_count": len(hrs)}

@api.post("/admin/run-weekly-pdf-now")
async def admin_run_weekly(u: TokenUser = Depends(require_roles("super_admin", "hr"))):
    """Manually trigger weekly PDF for this company."""
    # Reuse the all-companies helper logic but filtered
    # Quick approach: temporarily run for one company
    old = await db.companies.find({"id": u.company_id}, {"_id": 0}).to_list(1)
    # We just call the global runner; not the cheapest but simple
    res = await _run_weekly_pdf_for_all_companies()
    mine = [r for r in res if r.get("ok")]
    return {"results": res, "succeeded": len(mine)}

@api.post("/cron/generate-weekly-pdf")
async def cron_weekly_pdf(company_id: str = Query(...), secret: str = Query(...)):
    """Called by Make.com Friday 6pm. Generates PDF report, uploads to storage, returns URL."""
    _require_make_secret(secret)
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
        from reportlab.lib.units import cm
    except Exception as e:
        raise HTTPException(500, f"PDF library missing: {e}")
    cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).date().isoformat()
    company = await db.companies.find_one({"id": company_id}, {"_id": 0}) or {"name": "Unknown"}
    ups = await db.daily_updates.find({"company_id": company_id, "date": {"$gte": cutoff}}, {"_id": 0}).to_list(2000)
    tasks_done = await db.tasks.count_documents({"company_id": company_id, "status": "done", "updated_at": {"$gte": cutoff}})
    blockers = sum(1 for u in ups if u.get("blocker_text"))
    avg_mood = round(sum([u.get("mood_score",3) for u in ups])/len(ups), 2) if ups else 0
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    y = height - 2*cm
    c.setFont("Helvetica-Bold", 18); c.drawString(2*cm, y, f"{company['name']} — Weekly Report"); y -= 1*cm
    c.setFont("Helvetica", 10); c.drawString(2*cm, y, f"Week ending {date.today().isoformat()}"); y -= 1.2*cm
    c.setFont("Helvetica-Bold", 12); c.drawString(2*cm, y, "Summary"); y -= 0.7*cm
    c.setFont("Helvetica", 11)
    for line in [f"Daily updates submitted: {len(ups)}",
                 f"Tasks completed: {tasks_done}",
                 f"Blockers reported: {blockers}",
                 f"Average mood (1-5): {avg_mood}"]:
        c.drawString(2.3*cm, y, line); y -= 0.6*cm
    y -= 0.5*cm
    c.setFont("Helvetica-Bold", 12); c.drawString(2*cm, y, "AI digest"); y -= 0.7*cm
    c.setFont("Helvetica", 10)
    digest = await ai_digest(company_id)
    for chunk in [digest[i:i+95] for i in range(0, len(digest), 95)]:
        c.drawString(2.3*cm, y, chunk); y -= 0.5*cm
        if y < 3*cm: break
    c.showPage(); c.save()
    pdf_bytes = buf.getvalue()
    path = f"{APP_NAME}/{company_id}/reports/{date.today().isoformat()}-{gen_id()[:8]}.pdf"
    result = put_object(path, pdf_bytes, "application/pdf")
    fid = gen_id()
    await db.attachments.insert_one({
        "id": fid, "company_id": company_id, "user_id": "system",
        "storage_path": result["path"], "original_filename": f"weekly-report-{date.today().isoformat()}.pdf",
        "content_type": "application/pdf", "size": len(pdf_bytes),
        "task_id": None, "daily_update_date": None,
        "is_deleted": False, "created_at": now_iso(), "report": True,
    })
    hrs = await db.users.find({"company_id": company_id, "role": "hr"}, {"_id": 0, "id": 1, "telegram_id": 1}).to_list(50)
    for h in hrs:
        await db.notifications.insert_one({"id": gen_id(), "company_id": company_id, "user_id": h["id"],
                                            "type": "weekly_report", "read": False,
                                            "message": f"Weekly PDF report ready: /api/files/{fid}",
                                            "related_task_id": None, "created_at": now_iso()})
        if h.get("telegram_id"):
            tg_send(_tg_chat_id_of(h), f"Weekly report ready 📊")
    return {"ok": True, "file_id": fid, "size": len(pdf_bytes)}

# ---------- HR CRITICAL SLA WIDGET ----------
@api.get("/dashboard/sla")
async def critical_sla(u: TokenUser = Depends(require_roles("hr", "super_admin", "supervisor"))):
    """Average acknowledgement time for Critical tasks (the differentiator metric)."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    q = {"company_id": u.company_id, "priority": "critical",
         "acknowledged_at": {"$ne": None}, "updated_at": {"$gte": cutoff}}
    crits = await db.tasks.find(q, {"_id": 0}).to_list(500)
    times = []
    for t in crits:
        try:
            # find escalation timestamp from priority_changes
            esc = await db.priority_changes.find_one({"task_id": t["id"], "new_priority": "critical"},
                                                       sort=[("timestamp", -1)])
            start = datetime.fromisoformat(esc["timestamp"]) if esc else datetime.fromisoformat(t["updated_at"])
            ack = datetime.fromisoformat(t["acknowledged_at"])
            times.append((ack - start).total_seconds() / 60.0)  # minutes
        except Exception:
            continue
    unacked = await db.tasks.count_documents({"company_id": u.company_id, "priority": "critical",
                                                "acknowledged_at": None, "status": {"$ne": "done"},
                                                "archived": {"$ne": True}})
    avg_ack_min = round(sum(times) / len(times), 1) if times else 0
    over_30min = sum(1 for t in times if t > 30)
    return {
        "avg_ack_minutes": avg_ack_min,
        "total_critical_30d": len(crits),
        "over_30min_count": over_30min,
        "currently_unacknowledged": unacked,
        "compliance_pct": round(100 * (len(times) - over_30min) / len(times), 1) if times else 100.0,
    }

@api.get("/dashboard/mood-trend")
async def mood_trend(days: int = 30, u: TokenUser = Depends(current_user)):
    """Returns daily aggregate mood for charts. Scoped by role."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).date().isoformat()
    q = {"company_id": u.company_id, "date": {"$gte": cutoff}}
    if u.role in ("employee", "team_member", "developer"):
        q["user_id"] = u.user_id
    elif u.role == "supervisor":
        team = await db.users.find({"supervisor_id": u.user_id}, {"_id": 0, "id": 1}).to_list(500)
        q["user_id"] = {"$in": [x["id"] for x in team] + [u.user_id]}
    ups = await db.daily_updates.find(q, {"_id": 0, "date": 1, "mood_score": 1, "user_id": 1}).to_list(5000)
    bydate = {}
    for u_ in ups:
        d = u_["date"]; bydate.setdefault(d, []).append(u_.get("mood_score", 3))
    rows = [{"date": d, "avg_mood": round(sum(v)/len(v), 2), "count": len(v)} for d, v in sorted(bydate.items())]
    return rows

# ---------- GDPR — Right to Delete ----------
class GDPRConfirm(BaseModel):
    confirmation_text: str  # must equal "DELETE PERMANENTLY"

@api.delete("/users/{user_id}/purge")
async def gdpr_purge(user_id: str, body: GDPRConfirm, u: TokenUser = Depends(require_roles("hr", "super_admin"))):
    """Two-step destructive purge of all data for a user. Irreversible."""
    if body.confirmation_text != "DELETE PERMANENTLY":
        raise HTTPException(400, "Confirmation phrase mismatch")
    target = await db.users.find_one({"id": user_id, "company_id": u.company_id}, {"_id": 0})
    if not target:
        raise HTTPException(404, "User not found")
    if target["role"] == "super_admin":
        raise HTTPException(403, "Cannot purge super_admin")
    res = {
        "user": (await db.users.delete_one({"id": user_id, "company_id": u.company_id})).deleted_count,
        "tasks": (await db.tasks.delete_many({"company_id": u.company_id, "assigned_to_user_id": user_id})).deleted_count,
        "daily_updates": (await db.daily_updates.delete_many({"company_id": u.company_id, "user_id": user_id})).deleted_count,
        "notifications": (await db.notifications.delete_many({"company_id": u.company_id, "user_id": user_id})).deleted_count,
        "leaves": (await db.leaves.delete_many({"company_id": u.company_id, "user_id": user_id})).deleted_count,
        "audit_log": (await db.audit_log.delete_many({"company_id": u.company_id, "$or": [{"performed_by_user_id": user_id}, {"target_user_id": user_id}]})).deleted_count,
        "attachments": (await db.attachments.update_many({"company_id": u.company_id, "user_id": user_id}, {"$set": {"is_deleted": True}})).modified_count,
    }
    await audit(u.company_id, "gdpr_purge", u.user_id, user_id, None, None, res, "GDPR right-to-delete")
    return {"ok": True, "purged": res}

# ---------- MOUNT ----------
@app.on_event("startup")
async def _startup():
    init_storage()
    if SCHEDULER_ENABLED:
        try:
            from apscheduler.schedulers.asyncio import AsyncIOScheduler
            from apscheduler.triggers.cron import CronTrigger
            sched = AsyncIOScheduler(timezone="UTC")
            # Daily digest Mon-Fri at DIGEST_HOUR_UTC
            sched.add_job(_run_digest_for_all_companies, CronTrigger(day_of_week="mon-fri", hour=DIGEST_HOUR_UTC, minute=0), id="daily_digest", replace_existing=True)
            # Weekly PDF Friday at DIGEST_HOUR_UTC
            sched.add_job(_run_weekly_pdf_for_all_companies, CronTrigger(day_of_week="fri", hour=DIGEST_HOUR_UTC, minute=5), id="weekly_pdf", replace_existing=True)
            sched.start()
            log.info(f"Scheduler started: daily digest Mon-Fri {DIGEST_HOUR_UTC}:00 UTC, weekly PDF Fri {DIGEST_HOUR_UTC}:05 UTC")
        except Exception as e:
            log.warning(f"Scheduler failed to start: {e}")
    # Configure Telegram webhook automatically if token + base URL are set
    if TELEGRAM_BOT_TOKEN and PUBLIC_BASE_URL:
        try:
            wh = f"{PUBLIC_BASE_URL}/api/telegram/webhook"
            r = requests.post(f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/setWebhook",
                              json={"url": wh}, timeout=10)
            if r.status_code == 200:
                log.info(f"Telegram webhook set → {wh}")
            else:
                log.warning(f"Telegram setWebhook failed: {r.text[:200]}")
        except Exception as e:
            log.warning(f"Telegram setWebhook error: {e}")

# ---------- ROUTES: JIRA OAUTH (one-way external→WorkLog sync, read-only) ----------
import secrets as _secrets
import httpx as _httpx
from urllib.parse import urlencode as _urlencode

JIRA_AUTH_URL = "https://auth.atlassian.com/authorize"
JIRA_TOKEN_URL = "https://auth.atlassian.com/oauth/token"
JIRA_RESOURCES_URL = "https://api.atlassian.com/oauth/token/accessible-resources"
JIRA_SCOPES = "read:jira-work read:jira-user offline_access"

class JiraCallbackIn(BaseModel):
    code: str
    state: str

def _jira_configured() -> bool:
    return bool(JIRA_CLIENT_ID and JIRA_CLIENT_SECRET and JIRA_REDIRECT_URI)

@api.get("/integrations/jira/status")
async def jira_status(u: TokenUser = Depends(current_user)):
    integ = await db.jira_integrations.find_one({"user_id": u.user_id}, {"_id": 0, "access_token": 0, "refresh_token": 0})
    return {
        "configured": _jira_configured(),
        "connected": bool(integ),
        "site": integ.get("site_name") if integ else None,
        "email": integ.get("jira_email") if integ else None,
        "last_synced_at": integ.get("last_synced_at") if integ else None,
        "issue_count": integ.get("issue_count", 0) if integ else 0,
    }

@api.get("/integrations/jira/auth-url")
async def jira_auth_url(u: TokenUser = Depends(current_user)):
    if not _jira_configured():
        raise HTTPException(503, "Jira integration is not configured on the server. See ENV_REFERENCE.md.")
    state = _secrets.token_urlsafe(24)
    await db.jira_oauth_states.insert_one({
        "state": state, "user_id": u.user_id, "company_id": u.company_id,
        "created_at": now_iso(),
    })
    params = {
        "audience": "api.atlassian.com",
        "client_id": JIRA_CLIENT_ID,
        "scope": JIRA_SCOPES,
        "redirect_uri": JIRA_REDIRECT_URI,
        "state": state,
        "response_type": "code",
        "prompt": "consent",
    }
    return {"auth_url": f"{JIRA_AUTH_URL}?{_urlencode(params)}"}

@api.post("/integrations/jira/callback")
async def jira_callback(body: JiraCallbackIn, u: TokenUser = Depends(current_user)):
    if not _jira_configured():
        raise HTTPException(503, "Jira integration not configured")
    state_row = await db.jira_oauth_states.find_one({"state": body.state, "user_id": u.user_id}, {"_id": 0})
    if not state_row:
        raise HTTPException(400, "Invalid or expired state token")
    await db.jira_oauth_states.delete_one({"state": body.state})

    async with _httpx.AsyncClient(timeout=20) as cx:
        tok_resp = await cx.post(JIRA_TOKEN_URL, json={
            "grant_type": "authorization_code",
            "client_id": JIRA_CLIENT_ID,
            "client_secret": JIRA_CLIENT_SECRET,
            "code": body.code,
            "redirect_uri": JIRA_REDIRECT_URI,
        })
        if tok_resp.status_code != 200:
            raise HTTPException(400, f"Token exchange failed: {tok_resp.text[:200]}")
        tok = tok_resp.json()
        res_resp = await cx.get(JIRA_RESOURCES_URL, headers={"Authorization": f"Bearer {tok['access_token']}"})
        if res_resp.status_code != 200 or not res_resp.json():
            raise HTTPException(400, "Could not fetch accessible Jira resources")
        site = res_resp.json()[0]
        cloud_id = site["id"]
        site_name = site.get("name") or site.get("url")
        api_base = f"https://api.atlassian.com/ex/jira/{cloud_id}"
        me_resp = await cx.get(f"{api_base}/rest/api/3/myself", headers={"Authorization": f"Bearer {tok['access_token']}"})
        me = me_resp.json() if me_resp.status_code == 200 else {}

    expires_at = (datetime.now(timezone.utc) + timedelta(seconds=int(tok.get("expires_in", 3600)))).isoformat()
    await db.jira_integrations.update_one(
        {"user_id": u.user_id},
        {"$set": {
            "user_id": u.user_id,
            "company_id": u.company_id,
            "access_token": tok["access_token"],
            "refresh_token": tok.get("refresh_token"),
            "expires_at": expires_at,
            "cloud_id": cloud_id,
            "site_name": site_name,
            "api_base": api_base,
            "jira_account_id": me.get("accountId"),
            "jira_email": me.get("emailAddress"),
            "jira_display_name": me.get("displayName"),
            "connected_at": now_iso(),
            "issue_count": 0,
        }},
        upsert=True,
    )
    await audit(u.company_id, "jira_connected", u.user_id, u.user_id, None, None, {"site": site_name})
    return {"ok": True, "site": site_name, "email": me.get("emailAddress")}

async def _jira_get_valid_token(user_id: str) -> Optional[dict]:
    integ = await db.jira_integrations.find_one({"user_id": user_id}, {"_id": 0})
    if not integ:
        return None
    try:
        exp = datetime.fromisoformat(integ["expires_at"])
    except Exception:
        exp = datetime.now(timezone.utc) - timedelta(seconds=1)
    if exp - datetime.now(timezone.utc) > timedelta(seconds=120):
        return integ
    if not integ.get("refresh_token"):
        return None
    async with _httpx.AsyncClient(timeout=20) as cx:
        r = await cx.post(JIRA_TOKEN_URL, json={
            "grant_type": "refresh_token",
            "client_id": JIRA_CLIENT_ID,
            "client_secret": JIRA_CLIENT_SECRET,
            "refresh_token": integ["refresh_token"],
        })
        if r.status_code != 200:
            await db.jira_integrations.delete_one({"user_id": user_id})
            return None
        t = r.json()
    new_exp = (datetime.now(timezone.utc) + timedelta(seconds=int(t.get("expires_in", 3600)))).isoformat()
    await db.jira_integrations.update_one({"user_id": user_id}, {"$set": {
        "access_token": t["access_token"],
        "refresh_token": t.get("refresh_token", integ["refresh_token"]),
        "expires_at": new_exp,
    }})
    integ.update({"access_token": t["access_token"], "expires_at": new_exp})
    return integ

@api.post("/integrations/jira/sync")
async def jira_sync(u: TokenUser = Depends(current_user)):
    integ = await _jira_get_valid_token(u.user_id)
    if not integ:
        raise HTTPException(404, "Not connected to Jira — connect first")
    if u.role not in ("developer", "team_member", "supervisor", "hr", "super_admin"):
        raise HTTPException(403, "Role not allowed to sync Jira")
    headers = {"Authorization": f"Bearer {integ['access_token']}", "Accept": "application/json"}
    jql = "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC"
    issues_in = []
    start_at = 0
    async with _httpx.AsyncClient(timeout=20) as cx:
        while True:
            r = await cx.get(
                f"{integ['api_base']}/rest/api/3/search",
                params={"jql": jql, "startAt": start_at, "maxResults": 50, "fields": "summary,description,status,priority,duedate,issuetype,updated"},
                headers=headers,
            )
            if r.status_code != 200:
                raise HTTPException(502, f"Jira API error: {r.status_code} {r.text[:200]}")
            data = r.json()
            issues_in.extend(data.get("issues", []))
            if start_at + len(data.get("issues", [])) >= data.get("total", 0) or len(issues_in) >= 200:
                break
            start_at += 50

    upserted = 0
    site_base = (integ.get("site_name") or "").rstrip("/")
    for it in issues_in:
        f = it.get("fields", {})
        prio = (f.get("priority") or {}).get("name", "Medium").lower()
        prio_map = {"highest": "critical", "high": "high", "medium": "medium", "low": "low", "lowest": "low"}
        prio_w = prio_map.get(prio, "medium")
        status_name = ((f.get("status") or {}).get("statusCategory") or {}).get("key", "new")
        status_w = {"new": "todo", "indeterminate": "in_progress", "done": "done"}.get(status_name, "todo")
        due = f.get("duedate")
        external_id = f"jira:{it['key']}"
        await db.tasks.update_one(
            {"company_id": u.company_id, "external_id": external_id},
            {"$set": {
                "id": gen_id() if not await db.tasks.find_one({"external_id": external_id, "company_id": u.company_id}, {"_id": 0, "id": 1}) else None,
                "company_id": u.company_id,
                "title": f"[{it['key']}] {f.get('summary', '')[:140]}",
                "description": (f.get("description") or {}) if isinstance(f.get("description"), dict) else str(f.get("description") or ""),
                "assigned_to_user_id": u.user_id,
                "created_by_user_id": u.user_id,
                "type": "technical",
                "priority": prio_w,
                "status": status_w,
                "due_date": due,
                "is_recurring": False, "is_shared": False, "shared_with_user_ids": [],
                "external_id": external_id,
                "external_source": "jira",
                "external_url": f"{site_base}/browse/{it['key']}" if site_base else None,
                "updated_at": now_iso(),
            }, "$setOnInsert": {"created_at": now_iso(), "archived": False}},
            upsert=True,
        )
        upserted += 1
    await db.jira_integrations.update_one({"user_id": u.user_id},
        {"$set": {"last_synced_at": now_iso(), "issue_count": upserted}})
    await audit(u.company_id, "jira_sync", u.user_id, u.user_id, None, None, {"issues": upserted})
    return {"ok": True, "synced": upserted}

@api.post("/integrations/jira/disconnect")
async def jira_disconnect(u: TokenUser = Depends(current_user)):
    res = await db.jira_integrations.delete_one({"user_id": u.user_id})
    await audit(u.company_id, "jira_disconnected", u.user_id, u.user_id, None, None, {"deleted": res.deleted_count})
    return {"ok": True, "deleted": res.deleted_count}

app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
