import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Button } from "./ui/button";
import { Warning } from "@phosphor-icons/react";
import { toast } from "sonner";

/* Shows a fixed-top critical alert banner for any unacknowledged critical task assigned to current user */
export default function CriticalBanner({ user, onAck }) {
  const [task, setTask] = useState(null);

  const load = async () => {
    if (!user || user.role !== "employee" && user.role !== "team_member" && user.role !== "developer" && user.role !== "supervisor") return;
    try {
      const { data } = await api.get("/tasks", { params: { priority: "critical" } });
      const mine = data.find(
        (t) => t.assigned_to_user_id === user.user_id || t.assigned_to_user_id === user.id
      );
      const targetUserId = user.user_id || user.id;
      const myCrit = data.find((t) => t.assigned_to_user_id === targetUserId && !t.acknowledged_at && t.status !== "done");
      setTask(myCrit || null);
    } catch {}
  };
  useEffect(() => { load(); const i = setInterval(load, 30000); return () => clearInterval(i); }, [user]);

  const acknowledge = async () => {
    try {
      await api.post(`/tasks/${task.id}/acknowledge`);
      toast.success("Acknowledged");
      setTask(null);
      onAck && onAck();
    } catch (e) {
      toast.error("Failed to acknowledge");
    }
  };

  if (!task) return null;
  return (
    <div className="fixed top-0 left-0 lg:left-64 right-0 z-50 backdrop-blur-xl bg-white/90 border-b-2 border-red-600 p-3 flex items-center gap-3 critical-pulse">
      <Warning size={22} weight="fill" color="#DC2626" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-red-700">CRITICAL TASK — {task.title}</div>
        <div className="text-xs text-slate-600 truncate">Please acknowledge to confirm receipt.</div>
      </div>
      <Button onClick={acknowledge} className="bg-red-600 hover:bg-red-700" data-testid="critical-ack-btn">
        Acknowledged
      </Button>
    </div>
  );
}
