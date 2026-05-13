import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { PRIORITY_COLOR } from "../lib/auth";
import { api } from "../lib/api";
import { toast } from "sonner";

export default function TaskDetailDialog({ open, onOpenChange, task, peopleById, onChange, onEscalate }) {
  if (!task) return null;
  const assignee = peopleById?.[task.assigned_to_user_id];
  const creator = peopleById?.[task.created_by_user_id];

  const setStatus = async (status) => {
    try {
      await api.patch(`/tasks/${task.id}`, { status });
      toast.success(`Marked ${status.replace("_", " ")}`);
      onChange && onChange();
      onOpenChange(false);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" data-testid="task-detail-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="priority-dot" style={{ background: PRIORITY_COLOR[task.priority] }} />
            {task.title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {task.description && (
            <div>
              <div className="label-eyebrow mb-1">Description</div>
              <div className="text-slate-700 dark:text-zinc-200 whitespace-pre-wrap">{task.description}</div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="label-eyebrow mb-1">Status</div>
              <Badge variant="secondary" className="uppercase tracking-wider text-[10px]">{task.status?.replace("_"," ")}</Badge>
            </div>
            <div>
              <div className="label-eyebrow mb-1">Priority</div>
              <Badge variant="outline" className="uppercase tracking-wider text-[10px]" style={{ borderColor: PRIORITY_COLOR[task.priority], color: PRIORITY_COLOR[task.priority] }}>
                {task.priority}
              </Badge>
            </div>
            <div>
              <div className="label-eyebrow mb-1">Type</div>
              <span>{task.type}</span>
            </div>
            <div>
              <div className="label-eyebrow mb-1">Due date</div>
              <span>{task.due_date ? new Date(task.due_date).toLocaleDateString() : "—"}</span>
            </div>
            <div>
              <div className="label-eyebrow mb-1">Assigned to</div>
              <span>{assignee?.name || task.assigned_to_user_id}</span>
            </div>
            <div>
              <div className="label-eyebrow mb-1">Created by</div>
              <span>{creator?.name || task.created_by_user_id}</span>
            </div>
          </div>
          {task.is_shared && (
            <div>
              <div className="label-eyebrow mb-1">Shared with</div>
              <div className="flex flex-wrap gap-1">
                {(task.shared_with_user_ids || []).map((uid) => (
                  <Badge key={uid} variant="outline" className="text-[10px]">{peopleById?.[uid]?.name || uid}</Badge>
                ))}
              </div>
            </div>
          )}
          {task.blocker_text && (
            <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800">
              <div className="font-semibold mb-1">Blocker</div>{task.blocker_text}
            </div>
          )}
          <div className="text-xs text-slate-500 dark:text-zinc-400">
            Created {new Date(task.created_at).toLocaleString()}<br />
            Last updated {new Date(task.updated_at).toLocaleString()}
            {task.acknowledged_at && <><br />Acknowledged {new Date(task.acknowledged_at).toLocaleString()}</>}
          </div>
        </div>
        <DialogFooter className="flex flex-wrap gap-2">
          {task.status !== "in_progress" && <Button variant="outline" size="sm" onClick={() => setStatus("in_progress")} data-testid="detail-start">Start</Button>}
          {task.status !== "done" && <Button size="sm" onClick={() => setStatus("done")} data-testid="detail-done">Mark Done</Button>}
          {task.status !== "blocked" && <Button variant="outline" size="sm" onClick={() => setStatus("blocked")} data-testid="detail-block">Block</Button>}
          {onEscalate && <Button variant="ghost" size="sm" onClick={() => { onOpenChange(false); onEscalate(task); }} data-testid="detail-escalate">Change Priority</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
