import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ROLE_COLOR, ROLE_LABEL } from "../lib/auth";
import { TrophyIcon as Trophy, FireIcon as Fire } from "@phosphor-icons/react";

export default function Leaderboard() {
  const [rows, setRows] = useState([]);
  useEffect(() => { (async () => { const { data } = await api.get("/dashboard/leaderboard"); setRows(data); })(); }, []);
  return (
    <div className="space-y-6 max-w-2xl" data-testid="leaderboard-page">
      <div className="flex items-center gap-3">
        <Trophy size={28} weight="fill" color="#F59E0B" />
        <h1 className="text-3xl font-bold tracking-tight">Weekly Leaderboard</h1>
      </div>
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg divide-y">
        {rows.length === 0 && <div className="p-6 text-sm text-slate-500 dark:text-zinc-400 text-center">No completed tasks this week yet.</div>}
        {rows.map((r, i) => (
          <div key={r.id} className="p-4 flex items-center gap-4" data-testid={`leaderboard-row-${i}`}>
            <div className="w-8 h-8 rounded-md bg-slate-900 text-white flex items-center justify-center font-mono text-sm">{i + 1}</div>
            <div className="w-10 h-10 rounded-md flex items-center justify-center text-white font-semibold" style={{ background: ROLE_COLOR[r.role] }}>
              {r.name?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1">
              <div className="font-medium">{r.name}</div>
              <div className="text-xs text-slate-500 dark:text-zinc-400">{ROLE_LABEL[r.role]}</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-2xl font-bold">{r.completed}</div>
              <div className="text-xs text-slate-500 dark:text-zinc-400">completed</div>
            </div>
            {r.streak_count > 0 && (
              <div className="flex items-center gap-1 text-amber-600">
                <Fire size={16} weight="fill" />
                <span className="font-mono text-sm">{r.streak_count}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
