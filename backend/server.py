"""Smart WorkLog AI - FastAPI Backend
Multi-tenant workforce management. JWT auth. Priority escalation. Audit log. AI daily-update parsing via Gemini 2.5 Flash.
"""
from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta, date
from pathlib import Path
import os, uuid, logging, bcrypt, jwt, json, asyncio

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ['JWT_SECRET']
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

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

# ---------- AI (Gemini 2.5 Flash) ----------
async def ai_parse_update(raw_message: str, known_tasks: List[dict]) -> dict:
    """Use Gemini to parse the raw daily update text. Returns dict with mood_score, urgency, summary, ai_reply, language."""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception as e:
        log.warning(f"emergentintegrations not available: {e}")
        return {"mood_score": 3, "urgency": "low", "summary": raw_message[:140], "ai_reply": "Update logged.", "language": "en"}
    if not EMERGENT_LLM_KEY:
        return {"mood_score": 3, "urgency": "low", "summary": raw_message[:140], "ai_reply": "Update logged.", "language": "en"}

    task_list_str = "\n".join([f"- {t['id']}: {t['title']}" for t in known_tasks[:30]])
    sys = (
        "You are a workforce assistant. Parse an employee's daily update message and return strict JSON with keys: "
        "mood_score (int 1-5), urgency (low|medium|high), summary (one sentence), ai_reply (warm 2-sentence reply in user's language), "
        "language (ISO code: en/hi/ar/ur/bn/fr/sw). Reply ONLY with JSON, no markdown."
    )
    prompt = f"Known tasks:\n{task_list_str}\n\nEmployee message:\n{raw_message}\n\nReturn JSON only."
    try:
        chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"parse-{gen_id()}", system_message=sys).with_model("gemini", "gemini-2.5-flash")
        resp = await chat.send_message(UserMessage(text=prompt))
        text = resp.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()
        data = json.loads(text)
        return {
            "mood_score": int(data.get("mood_score", 3)),
            "urgency": data.get("urgency", "low"),
            "summary": data.get("summary", raw_message[:140]),
            "ai_reply": data.get("ai_reply", "Update logged."),
            "language": data.get("language", "en"),
        }
    except Exception as e:
        log.warning(f"AI parse failed: {e}")
        return {"mood_score": 3, "urgency": "low", "summary": raw_message[:140], "ai_reply": "Update logged.", "language": "en"}

async def ai_digest(company_id: str) -> str:
    today = date.today().isoformat()
    updates = await db.daily_updates.find({"company_id": company_id, "date": today}, {"_id": 0}).to_list(500)
    tasks_open = await db.tasks.count_documents({"company_id": company_id, "status": {"$ne": "done"}, "archived": {"$ne": True}})
    crit = await db.tasks.count_documents({"company_id": company_id, "priority": "critical", "status": {"$ne": "done"}, "archived": {"$ne": True}})
    avg_mood = sum([u.get("mood_score", 3) for u in updates]) / len(updates) if updates else 0
    summary = f"Updates today: {len(updates)} | Avg mood: {avg_mood:.1f}/5 | Open tasks: {tasks_open} | Critical: {crit}"
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"digest-{gen_id()}", system_message="You are an HR assistant. Write a 3-sentence digest based on today's stats. Plain English.").with_model("gemini", "gemini-2.5-flash")
        resp = await chat.send_message(UserMessage(text=summary))
        return resp.strip()
    except Exception as e:
        log.warning(f"AI digest failed: {e}")
        return summary

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

# ---------- ROUTES: USERS / TEAMS ----------
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

# ---------- MOUNT ----------
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
