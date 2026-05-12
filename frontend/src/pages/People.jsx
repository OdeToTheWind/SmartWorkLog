import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth, ROLE_COLOR, ROLE_LABEL } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { PlusIcon as Plus } from "@phosphor-icons/react";
import { Trash2 } from "lucide-react";
import GdprPurgeDialog from "../components/GdprPurgeDialog";
import { toast } from "sonner";

const ROLES = ["hr", "supervisor", "developer", "team_member", "employee"];

export default function People() {
  const { user } = useAuth();
  const [people, setPeople] = useState([]);
  const [teams, setTeams] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "employee", team_id: "", supervisor_id: "", timezone: "UTC", language: "en" });
  const canCreate = ["super_admin", "hr"].includes(user.role);

  const load = async () => {
    const [u, t] = await Promise.all([api.get("/users"), api.get("/teams")]);
    setPeople(u.data);
    setTeams(t.data);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.name || !form.email || !form.password) { toast.error("Name, email and password required"); return; }
    try {
      const payload = { ...form };
      if (!payload.team_id) delete payload.team_id;
      if (!payload.supervisor_id) delete payload.supervisor_id;
      await api.post("/users", payload);
      toast.success("Account created");
      setShowCreate(false);
      setForm({ name: "", email: "", password: "", role: "employee", team_id: "", supervisor_id: "", timezone: "UTC", language: "en" });
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    }
  };

  const supervisors = people.filter((p) => p.role === "supervisor");
  const [gdprTarget, setGdprTarget] = useState(null);
  const canPurge = ["hr", "super_admin"].includes(user.role);

  return (
    <div className="space-y-6" data-testid="people-page">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">People</h1>
        {canCreate && <Button onClick={() => setShowCreate(true)} data-testid="create-user-btn"><Plus size={16} className="mr-1" /> Add person</Button>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {people.map((p) => (
          <div key={p.id} className="bg-white border border-slate-200 rounded-lg p-4" data-testid={`people-card-${p.id}`}>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-md flex items-center justify-center text-white text-base font-semibold" style={{ background: ROLE_COLOR[p.role] }}>
                {p.name?.[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{p.name}</div>
                <div className="text-xs text-slate-500 truncate">{p.email}</div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <span className="role-pill" style={{ background: `${ROLE_COLOR[p.role]}15`, color: ROLE_COLOR[p.role] }}>{ROLE_LABEL[p.role]}</span>
              {p.streak_count > 0 && <span className="text-xs text-slate-500">{p.streak_count}d streak</span>}
              {canPurge && p.id !== user.user_id && p.role !== "super_admin" && (
                <button
                  onClick={() => setGdprTarget(p)}
                  className="ml-auto text-red-500 hover:text-red-700 p-1 rounded"
                  data-testid={`gdpr-btn-${p.id}`}
                  title="GDPR — permanent delete"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent data-testid="create-user-dialog">
          <DialogHeader><DialogTitle>Add new person</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="user-name-input" />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="user-email-input" />
            </div>
            <div>
              <Label>Password</Label>
              <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="user-password-input" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger data-testid="user-role-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Team</Label>
                <Select value={form.team_id || "none"} onValueChange={(v) => setForm({ ...form, team_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Supervisor</Label>
                <Select value={form.supervisor_id || "none"} onValueChange={(v) => setForm({ ...form, supervisor_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {supervisors.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Language</Label>
                <Select value={form.language} onValueChange={(v) => setForm({ ...form, language: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["en","hi","ar","ur","bn","fr","sw"].map((l) => <SelectItem key={l} value={l}>{l.toUpperCase()}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={create} data-testid="user-create-submit">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <GdprPurgeDialog open={!!gdprTarget} onOpenChange={(o) => !o && setGdprTarget(null)} user={gdprTarget} onPurged={load} />
    </div>
  );
}
