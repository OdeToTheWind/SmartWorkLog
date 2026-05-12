import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Plus, CheckCircle, XCircle } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function Leave() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ start_date: "", end_date: "", leave_type: "annual", reason: "" });
  const canApprove = ["supervisor","hr","super_admin"].includes(user.role);

  const load = async () => {
    const { data } = await api.get("/leaves");
    setItems(data);
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    try {
      await api.post("/leaves", form);
      toast.success("Leave requested");
      setShow(false);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const decide = async (id, approved) => {
    try {
      await api.post(`/leaves/${id}/approve`, { approved });
      toast.success(approved ? "Approved" : "Rejected");
      load();
    } catch (e) { toast.error("Failed"); }
  };

  return (
    <div className="space-y-6" data-testid="leave-page">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Leave</h1>
        <Button onClick={() => setShow(true)} data-testid="request-leave-btn"><Plus size={16} className="mr-1" /> Request leave</Button>
      </div>

      <div className="space-y-2">
        {items.length === 0 && <div className="text-sm text-slate-500">No leave requests.</div>}
        {items.map((l) => (
          <div key={l.id} className="bg-white border border-slate-200 rounded-lg p-4 flex items-center gap-3" data-testid={`leave-${l.id}`}>
            <div className="flex-1">
              <div className="text-sm font-medium">{l.start_date} → {l.end_date}</div>
              <div className="text-xs text-slate-500">{l.leave_type} {l.reason && `· ${l.reason}`}</div>
            </div>
            <div className={`text-xs font-medium uppercase ${l.status === "approved" ? "text-emerald-600" : l.status === "rejected" ? "text-red-600" : "text-amber-600"}`}>{l.status}</div>
            {canApprove && l.status === "pending" && (
              <>
                <Button size="sm" onClick={() => decide(l.id, true)} data-testid={`leave-approve-${l.id}`}><CheckCircle size={14} className="mr-1" /> Approve</Button>
                <Button size="sm" variant="outline" onClick={() => decide(l.id, false)} data-testid={`leave-reject-${l.id}`}><XCircle size={14} className="mr-1" /> Reject</Button>
              </>
            )}
          </div>
        ))}
      </div>

      <Dialog open={show} onOpenChange={setShow}>
        <DialogContent data-testid="leave-dialog">
          <DialogHeader><DialogTitle>Request leave</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} data-testid="leave-start" /></div>
              <div><Label>End</Label><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} data-testid="leave-end" /></div>
            </div>
            <div>
              <Label>Type</Label>
              <Select value={form.leave_type} onValueChange={(v) => setForm({ ...form, leave_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="annual">Annual</SelectItem>
                  <SelectItem value="sick">Sick</SelectItem>
                  <SelectItem value="personal">Personal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Reason (optional)</Label><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShow(false)}>Cancel</Button>
            <Button onClick={submit} data-testid="leave-submit">Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
