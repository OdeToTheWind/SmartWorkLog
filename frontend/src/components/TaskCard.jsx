import React, { useState } from "react";
import { PRIORITY_COLOR } from "../lib/auth";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { CheckCircleIcon as CheckCircle, ClockIcon as Clock, WarningIcon as Warning, ArrowUpIcon as ArrowUp } from "@phosphor-icons/react";
import { api } from "../lib/api";
import { toast } from "sonner";

export default function TaskCard({ task, onChange, onEscalate, canEdit = true }) {
  const [busy, setBusy] = useState(false);
  const updateStatus = async (status) => {
    setBusy(true);
    try {
      await api.patch(`/tasks/${task.id}`, { status });
      toast.success(`Marked ${status.replace("_", " ")}`);
      onChange && onChange();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    } finally { setBusy(false); }
  };

  const isCritical = task.priority === "critical";
  return (
    <div
      data-testid={`task-card-${task.id}`}
      className={`bg-white border rounded-lg p-4 transition-all hover:shadow-sm hover:-translate-y-[1px] ${isCritical ? "border-red-500 critical-pulse" : "border-slate-200"}`}
    >
      <div className="flex items-start gap-3">
        <span className="priority-dot mt-2" style={{ background: PRIORITY_COLOR[task.priority] }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <div className="font-medium text-sm leading-tight">{task.title}</div>
              {task.description && <div className="text-xs text-slate-500 mt-1 line-clamp-2">{task.description}</div>}
            </div>
            <Badge
              variant="outline"
              className="uppercase text-[10px] tracking-wider"
              style={{ borderColor: PRIORITY_COLOR[task.priority], color: PRIORITY_COLOR[task.priority] }}
              data-testid={`priority-badge-${task.id}`}
            >
              {task.priority}
            </Badge>
          </div>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">{task.status?.replace("_", " ")}</Badge>
            {task.due_date && (
              <span className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                <Clock size={12} /> {new Date(task.due_date).toLocaleDateString()}
              </span>
            )}
            {task.is_shared && <Badge variant="outline" className="text-[10px]">Shared</Badge>}
            {task.type !== "general" && <Badge variant="outline" className="text-[10px]">{task.type}</Badge>}
          </div>
          {canEdit && (
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {task.status !== "in_progress" && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => updateStatus("in_progress")} data-testid={`btn-inprogress-${task.id}`}>
                  Start
                </Button>
              )}
              {task.status !== "done" && (
                <Button size="sm" disabled={busy} onClick={() => updateStatus("done")} data-testid={`btn-done-${task.id}`}>
                  <CheckCircle size={14} weight="fill" className="mr-1" /> Done
                </Button>
              )}
              {task.status !== "blocked" && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => updateStatus("blocked")} data-testid={`btn-blocked-${task.id}`}>
                  <Warning size={14} className="mr-1" /> Block
                </Button>
              )}
              {onEscalate && (
                <Button size="sm" variant="ghost" onClick={() => onEscalate(task)} data-testid={`btn-escalate-${task.id}`}>
                  <ArrowUp size={14} className="mr-1" /> Priority
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
