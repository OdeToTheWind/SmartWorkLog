import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { toast } from "sonner";

export default function EditTeamDialog({ open, onOpenChange, team, supervisors, onSaved }) {
  const [form, setForm] = useState({ name: "", supervisor_id: "" });
  const [confirmDel, setConfirmDel] = useState(false);
  useEffect(() => {
    if (team) {
      setForm({ name: team.name || "", supervisor_id: team.supervisor_id || "" });
      setConfirmDel(false);
    }
  }, [team]);
  if (!team) return null;

  const save = async () => {
    if (!form.name) { toast.error("Name required"); return; }
    try {
      await api.patch(`/teams/${team.id}`, { name: form.name, supervisor_id: form.supervisor_id || "" });
      toast.success("Team updated"); onSaved && onSaved(); onOpenChange(false);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const remove = async () => {
    try {
      const { data } = await api.delete(`/teams/${team.id}`);
      toast.success(`Team deleted (${data.members_unassigned} member(s) unassigned)`);
      onSaved && onSaved(); onOpenChange(false);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="edit-team-dialog">
        <DialogHeader><DialogTitle>Edit team — {team.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Team name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="edit-team-name" />
          </div>
          <div>
            <Label>Supervisor</Label>
            <Select value={form.supervisor_id || "none"} onValueChange={(v) => setForm({ ...form, supervisor_id: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {supervisors.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="border-t pt-3 mt-3">
            {!confirmDel ? (
              <Button variant="outline" className="text-red-600 hover:text-red-700" onClick={() => setConfirmDel(true)} data-testid="delete-team-btn">
                Delete team
              </Button>
            ) : (
              <div className="bg-red-50 border border-red-200 rounded p-3 space-y-2">
                <div className="text-xs text-red-700">Delete <strong>{team.name}</strong>? All members will be unassigned (their data is kept). This cannot be undone.</div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setConfirmDel(false)}>Cancel</Button>
                  <Button variant="destructive" size="sm" onClick={remove} data-testid="confirm-delete-team">Yes, delete</Button>
                </div>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={save} data-testid="edit-team-save">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
