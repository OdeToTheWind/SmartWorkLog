import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { PlusIcon as Plus, CheckCircleIcon as CheckCircle, XCircleIcon as XCircle } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function Leave() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [peopleMap, setPeopleMap] = useState({});
  const [filter, setFilter] = useState("all");
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ start_date: "", end_date: "", leave_type: "annual", reason: "" });
  const canApprove = ["supervisor","hr","super_admin"].includes(user.role);
  const isAdmin = ["hr","super_admin","supervisor"].includes(user.role);

  const load = async () => {
    const [l, u] = await Promise.all([api.get("/leaves"), api.get("/users")]);
    setItems(l.data);
    const m = {}; u.data.forEach((p) => { m[p.id] = p; });
    setPeopleMap(m);
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

      <div className="flex items-center justify-between gap-3 flex-wrap">
        {isAdmin && items.length > 0 && (
          <div className="flex gap-1 text-xs">
            {["all","pending","approved","rejected"].map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-3 py-1.5 rounded-md border ${filter === s ? "bg-slate-900 text-white border-slate-900" : "bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-300 border-slate-200 dark:border-zinc-800"}`}
                data-testid={`leave-filter-${s}`}
              >
                {s} {s !== "all" && `(${items.filter((l) => l.status === s).length})`}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        {items.length === 0 && <div className="text-sm text-slate-500 dark:text-zinc-400">No leave requests.</div>}
        {items.filter((l) => filter === "all" || l.status === filter).map((l) => {
          const person = peopleMap[l.user_id];
          return (
          <div key={l.id} className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg p-4 flex items-center gap-3" data-testid={`leave-${l.id}`}>
            {isAdmin && person && (
              <div className="w-9 h-9 rounded-md flex items-center justify-center text-white text-sm font-semibold flex-shrink-0" style={{ background: "#4F46E5" }}>
                {person.name?.[0]?.toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              {isAdmin && person && <div className="text-sm font-medium">{person.name} <span className="text-xs text-slate-500 dark:text-zinc-400 font-normal">· {person.email}</span></div>}
              <div className="text-sm">{l.start_date} → {l.end_date}</div>
              <div className="text-xs text-slate-500 dark:text-zinc-400">{l.leave_type} {l.reason && `· ${l.reason}`}</div>
            </div>
            <div className={`text-xs font-medium uppercase ${l.status === "approved" ? "text-emerald-600" : l.status === "rejected" ? "text-red-600" : "text-amber-600"}`}>{l.status}</div>
            {canApprove && l.status === "pending" && (
              <>
                <Button size="sm" onClick={() => decide(l.id, true)} data-testid={`leave-approve-${l.id}`}><CheckCircle size={14} className="mr-1" /> Approve</Button>
                <Button size="sm" variant="outline" onClick={() => decide(l.id, false)} data-testid={`leave-reject-${l.id}`}><XCircle size={14} className="mr-1" /> Reject</Button>
              </>
            )}
          </div>
        ); })}
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
