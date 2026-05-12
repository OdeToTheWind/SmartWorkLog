import React, { useState } from "react";
import { api } from "../lib/api";
import { PRIORITY_COLOR } from "../lib/auth";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Switch } from "./ui/switch";
import { Checkbox } from "./ui/checkbox";
import { toast } from "sonner";

const LEVELS = ["low", "medium", "high", "critical"];

export default function PriorityModal({ open, onOpenChange, task, otherTasks = [], onSaved }) {
  const [newPriority, setNewPriority] = useState(task?.priority || "medium");
  const [reason, setReason] = useState("");
  const [requiresSacrifice, setRequiresSacrifice] = useState(false);
  const [sacrificed, setSacrificed] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    if (task) {
      setNewPriority(task.priority);
      setReason("");
      setRequiresSacrifice(false);
      setSacrificed([]);
    }
  }, [task]);

  if (!task) return null;

  const submit = async () => {
    if (reason.trim().length < 10) {
      toast.error("Reason must be at least 10 characters");
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/tasks/${task.id}/priority`, {
        new_priority: newPriority,
        reason: reason.trim(),
        requires_sacrifice: requiresSacrifice,
        sacrificed_task_ids: requiresSacrifice ? sacrificed : [],
      });
      toast.success(`Priority updated to ${newPriority}`);
      onSaved && onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to change priority");
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="priority-modal">
        <DialogHeader>
          <DialogTitle>Change priority — {task.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="label-eyebrow">New priority</Label>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {LEVELS.map((lv) => (
                <button
                  key={lv}
                  data-testid={`priority-option-${lv}`}
                  onClick={() => setNewPriority(lv)}
                  className={`px-3 py-2 rounded-md text-xs font-medium uppercase border transition-all ${newPriority === lv ? "text-white" : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"}`}
                  style={newPriority === lv ? { background: PRIORITY_COLOR[lv], borderColor: PRIORITY_COLOR[lv] } : {}}
                >
                  {lv}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="reason" className="label-eyebrow">Reason (min 10 chars)</Label>
            <Textarea
              id="reason"
              data-testid="escalation-reason-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this priority changing?"
              rows={3}
              className="mt-1"
            />
            <div className="text-xs text-slate-500 mt-1">{reason.length} / 10</div>
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="sacrifice-toggle" className="text-sm">Requires sacrificing other tasks?</Label>
            <Switch id="sacrifice-toggle" data-testid="sacrifice-toggle" checked={requiresSacrifice} onCheckedChange={setRequiresSacrifice} />
          </div>
          {requiresSacrifice && (
            <div className="border border-slate-200 rounded-md p-3 max-h-48 overflow-y-auto space-y-2">
              <div className="label-eyebrow">Select tasks to deprioritise</div>
              {otherTasks.filter((t) => t.id !== task.id && t.status !== "done").map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    data-testid={`sacrifice-${t.id}`}
                    checked={sacrificed.includes(t.id)}
                    onCheckedChange={(ck) => setSacrificed(ck ? [...sacrificed, t.id] : sacrificed.filter((x) => x !== t.id))}
                  />
                  <span className="priority-dot" style={{ background: PRIORITY_COLOR[t.priority] }} />
                  <span>{t.title}</span>
                </label>
              ))}
              {otherTasks.length === 0 && <div className="text-xs text-slate-500">No other tasks available.</div>}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="priority-cancel">Cancel</Button>
          <Button onClick={submit} disabled={submitting} data-testid="priority-submit">
            {submitting ? "Saving..." : "Update Priority"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
