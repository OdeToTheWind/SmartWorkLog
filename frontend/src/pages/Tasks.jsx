import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth, PRIORITY_COLOR } from "../lib/auth";
import TaskCard from "../components/TaskCard";
import PriorityModal from "../components/PriorityModal";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Switch } from "../components/ui/switch";
import { PlusIcon as Plus, MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react";
import { LayoutGrid, Rows3 } from "lucide-react";
import TaskDetailDialog from "../components/TaskDetailDialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { toast } from "sonner";

const STATUSES = ["todo", "in_progress", "done", "blocked"];
const PRIORITIES = ["low", "medium", "high", "critical"];

export default function Tasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [people, setPeople] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [escalate, setEscalate] = useState(null);
  const [filter, setFilter] = useState({ q: "", priority: "", status: "" });
  const [view, setView] = useState(() => localStorage.getItem("tasks_view") || "table");
  const [detail, setDetail] = useState(null);
  // form
  const [form, setForm] = useState({
    title: "", description: "", assigned_to_user_id: "", type: "general",
    priority: "medium", due_date: "", is_recurring: false, recurrence_rule: "daily",
    is_shared: false,
  });

  const load = async () => {
    const [t, u] = await Promise.all([api.get("/tasks"), api.get("/users")]);
    setTasks(t.data);
    setPeople(u.data);
  };
  useEffect(() => { load(); }, []);

  const canCreate = ["super_admin","hr","supervisor","developer","team_member","employee"].includes(user.role);

  const create = async () => {
    if (!form.title || !form.assigned_to_user_id) {
      toast.error("Title and assignee required");
      return;
    }
    try {
      await api.post("/tasks", { ...form, due_date: form.due_date ? new Date(form.due_date).toISOString() : null });
      toast.success("Task created");
      setShowCreate(false);
      setForm({ title: "", description: "", assigned_to_user_id: "", type: "general", priority: "medium", due_date: "", is_recurring: false, recurrence_rule: "daily", is_shared: false });
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Create failed");
    }
  };

  const filtered = tasks.filter((t) => {
    if (filter.q && !t.title.toLowerCase().includes(filter.q.toLowerCase())) return false;
    if (filter.priority && t.priority !== filter.priority) return false;
    if (filter.status && t.status !== filter.status) return false;
    return true;
  }).sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return (order[a.priority] || 4) - (order[b.priority] || 4);
  });

  // Kanban-like for developer
  const isKanban = view === "kanban" || (user.role === "developer" && view === "auto");
  const peopleById = React.useMemo(() => Object.fromEntries(people.map((p) => [p.id, p])), [people]);
  React.useEffect(() => { localStorage.setItem("tasks_view", view); }, [view]);

  return (
    <div className="space-y-6" data-testid="tasks-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
        {canCreate && (
          <Button onClick={() => setShowCreate(true)} data-testid="create-task-btn">
            <Plus size={16} className="mr-1" /> New task
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
          <Input value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} placeholder="Search tasks..." className="pl-9" data-testid="task-search" />
        </div>
        <Select value={filter.priority || "all"} onValueChange={(v) => setFilter({ ...filter, priority: v === "all" ? "" : v })}>
          <SelectTrigger className="w-[150px]" data-testid="filter-priority"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filter.status || "all"} onValueChange={(v) => setFilter({ ...filter, status: v === "all" ? "" : v })}>
          <SelectTrigger className="w-[150px]" data-testid="filter-status"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-md overflow-hidden">
          <button onClick={() => setView("table")} className={`p-2 ${view === "table" ? "bg-slate-900 text-white" : "text-slate-500 dark:text-zinc-400"}`} data-testid="view-table" title="Table"><Rows3 size={14} /></button>
          <button onClick={() => setView("grid")} className={`p-2 ${view === "grid" ? "bg-slate-900 text-white" : "text-slate-500 dark:text-zinc-400"}`} data-testid="view-grid" title="Cards"><LayoutGrid size={14} /></button>
          <button onClick={() => setView("kanban")} className={`p-2 ${view === "kanban" ? "bg-slate-900 text-white" : "text-slate-500 dark:text-zinc-400"}`} data-testid="view-kanban" title="Kanban">K</button>
        </div>
      </div>

      {isKanban ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {["critical", ...STATUSES].slice(0,5).map((col) => {
            const items = filtered.filter((t) => col === "critical" ? t.priority === "critical" && t.status !== "done" : t.status === col);
            return (
              <div key={col} className="bg-slate-100 dark:bg-zinc-800 rounded-lg p-2 min-h-[300px]" data-testid={`kanban-col-${col}`}>
                <div className="label-eyebrow px-2 py-1.5 flex items-center justify-between">
                  <span>{col.replace("_", " ")}</span>
                  <span className="font-mono">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map((t) => <TaskCard key={t.id} task={t} onChange={load} onEscalate={setEscalate} />)}
                </div>
              </div>
            );
          })}
        </div>
      ) : view === "table" ? (
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg overflow-x-auto" data-testid="tasks-table">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead className="w-[100px]">Priority</TableHead>
                <TableHead className="w-[110px]">Status</TableHead>
                <TableHead className="w-[140px]">Assigned to</TableHead>
                <TableHead className="w-[110px]">Type</TableHead>
                <TableHead className="w-[110px]">Due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-slate-500 dark:text-zinc-400 py-8">No tasks match these filters.</TableCell></TableRow>}
              {filtered.map((t) => {
                const assignee = peopleById[t.assigned_to_user_id];
                return (
                  <TableRow key={t.id} onClick={() => setDetail(t)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-800 dark:bg-zinc-950" data-testid={`task-row-${t.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="priority-dot" style={{ background: PRIORITY_COLOR[t.priority] }} />
                        <span className="font-medium">{t.title}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="uppercase tracking-wider text-[10px]" style={{ borderColor: PRIORITY_COLOR[t.priority], color: PRIORITY_COLOR[t.priority] }}>{t.priority}</Badge>
                    </TableCell>
                    <TableCell><Badge variant="secondary" className="uppercase text-[10px]">{t.status.replace("_"," ")}</Badge></TableCell>
                    <TableCell className="text-xs">{assignee?.name || "—"}</TableCell>
                    <TableCell className="text-xs text-slate-500 dark:text-zinc-400">{t.type}</TableCell>
                    <TableCell className="text-xs">{t.due_date ? new Date(t.due_date).toLocaleDateString() : "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((t) => <TaskCard key={t.id} task={t} onChange={load} onEscalate={setEscalate} />)}
          {filtered.length === 0 && <div className="text-sm text-slate-500 dark:text-zinc-400 col-span-full text-center py-8">No tasks yet.</div>}
        </div>
      )}

      <TaskDetailDialog
        open={!!detail}
        onOpenChange={(o) => !o && setDetail(null)}
        task={detail}
        peopleById={peopleById}
        onChange={load}
        onEscalate={setEscalate}
      />

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent data-testid="create-task-dialog">
          <DialogHeader><DialogTitle>Create task</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Title</Label>
              <Input data-testid="task-title-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Assign to</Label>
                <Select value={form.assigned_to_user_id} onValueChange={(v) => setForm({ ...form, assigned_to_user_id: v })}>
                  <SelectTrigger data-testid="task-assignee"><SelectValue placeholder="Select person" /></SelectTrigger>
                  <SelectContent>
                    {people.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["general", "technical", "operational", "hr"].map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger data-testid="task-priority"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Due date</Label>
                <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>Shared task</Label>
              <Switch checked={form.is_shared} onCheckedChange={(v) => setForm({ ...form, is_shared: v })} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Recurring</Label>
              <Switch checked={form.is_recurring} onCheckedChange={(v) => setForm({ ...form, is_recurring: v })} />
            </div>
            {form.is_recurring && (
              <Select value={form.recurrence_rule} onValueChange={(v) => setForm({ ...form, recurrence_rule: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={create} data-testid="task-create-submit">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PriorityModal
        open={!!escalate}
        onOpenChange={(o) => !o && setEscalate(null)}
        task={escalate}
        otherTasks={tasks.filter((t) => t.assigned_to_user_id === escalate?.assigned_to_user_id)}
        onSaved={load}
      />
    </div>
  );
}
