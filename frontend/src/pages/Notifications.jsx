import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { BellIcon as Bell, CheckCircleIcon as CheckCircle } from "@phosphor-icons/react";
import { Button } from "../components/ui/button";

export default function Notifications() {
  const [items, setItems] = useState([]);
  const load = async () => {
    const { data } = await api.get("/notifications");
    setItems(data);
  };
  useEffect(() => { load(); }, []);

  const markRead = async (id) => { await api.post(`/notifications/${id}/read`); load(); };
  const markAll = async () => { await api.post("/notifications/read-all"); load(); };

  return (
    <div className="space-y-6 max-w-3xl" data-testid="notifications-page">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
        <Button variant="outline" onClick={markAll} data-testid="mark-all-read"><CheckCircle size={16} className="mr-1" /> Mark all read</Button>
      </div>
      <div className="space-y-2">
        {items.length === 0 && <div className="text-slate-500 dark:text-zinc-400 text-sm">No notifications yet.</div>}
        {items.map((n) => (
          <div key={n.id} className={`bg-white dark:bg-zinc-900 border rounded-lg p-4 flex items-start gap-3 ${n.read ? "border-slate-200 dark:border-zinc-800 opacity-70" : "border-slate-300 dark:border-zinc-700"}`} data-testid={`notif-${n.id}`}>
            <Bell size={18} className={n.type?.includes("critical") ? "text-red-600" : "text-slate-500 dark:text-zinc-400"} weight={n.read ? "regular" : "fill"} />
            <div className="flex-1 min-w-0">
              <div className="text-sm">{n.message}</div>
              <div className="text-xs text-slate-500 dark:text-zinc-400 mt-1">{new Date(n.created_at).toLocaleString()}</div>
            </div>
            {!n.read && <Button size="sm" variant="ghost" onClick={() => markRead(n.id)}>Read</Button>}
          </div>
        ))}
      </div>
    </div>
  );
}
