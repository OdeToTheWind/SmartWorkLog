import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ROLE_LABEL } from "../lib/auth";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Switch } from "./ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { toast } from "sonner";

const ROLES = ["hr", "supervisor", "developer", "team_member", "employee"];

export default function EditPersonDialog({ open, onOpenChange, person, teams, supervisors, onSaved }) {
  const [form, setForm] = useState({});
  useEffect(() => {
    if (person) {
      setForm({
        name: person.name || "",
        role: person.role || "employee",
        team_id: person.team_id || "",
        supervisor_id: person.supervisor_id || "",
        timezone: person.timezone || "UTC",
        language: person.language || "en",
        telegram_username: person.telegram_username || "",
        active: person.active !== false,
      });
    }
  }, [person]);

  if (!person) return null;

  const save = async () => {
    try {
      const payload = { ...form };
      // pass "" through to clear (backend interprets "" as null for team/supervisor)
      await api.patch(`/users/${person.id}`, payload);
      toast.success("Updated");
      onSaved && onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="edit-person-dialog">
        <DialogHeader><DialogTitle>Edit {person.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="edit-name-input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger data-testid="edit-role-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Team</Label>
              <Select value={form.team_id || "none"} onValueChange={(v) => setForm({ ...form, team_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Supervisor</Label>
              <Select value={form.supervisor_id || "none"} onValueChange={(v) => setForm({ ...form, supervisor_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {supervisors.filter((s) => s.id !== person.id).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
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
          <div>
            <Label>Timezone</Label>
            <Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} placeholder="e.g. Asia/Kolkata" />
          </div>
          <div>
            <Label>Telegram username</Label>
            <Input value={form.telegram_username} onChange={(e) => setForm({ ...form, telegram_username: e.target.value })} placeholder="@handle" />
          </div>
          <div className="flex items-center justify-between">
            <Label>Active</Label>
            <Switch checked={!!form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} data-testid="edit-person-save">Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
