import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth, ROLE_COLOR, ROLE_LABEL, PRIORITY_COLOR } from "../lib/auth";
import TaskCard from "../components/TaskCard";
import PriorityModal from "../components/PriorityModal";
import SLAWidget from "../components/SLAWidget";
import { Button } from "../components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import { TrophyIcon as Trophy, FireIcon as Fire, SparkleIcon as Sparkle } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function Dashboard() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [summary, setSummary] = useState({});
  const [tasks, setTasks] = useState([]);
  const [people, setPeople] = useState([]);
  const [digest, setDigest] = useState("");
  const [escalateTask, setEscalateTask] = useState(null);
  const [updateText, setUpdateText] = useState("");
  const [mood, setMood] = useState(4);
  const [submittingUpdate, setSubmittingUpdate] = useState(false);
  const [streak, setStreak] = useState(user?.streak_count || 0);

  const loadAll = async () => {
    try {
      const [s, t] = await Promise.all([api.get("/dashboard/summary"), api.get("/tasks")]);
      setSummary(s.data);
      setTasks(t.data);
      if (["hr", "supervisor", "super_admin"].includes(user.role)) {
        const p = await api.get("/users");
        setPeople(p.data);
      }
      if (["hr", "supervisor"].includes(user.role)) {
        try {
          const d = await api.get("/dashboard/digest");
          setDigest(d.data.digest);
        } catch {}
      }
      const me = await api.get("/auth/me");
      setStreak(me.data.streak_count || 0);
    } catch (e) {
      console.error(e);
    }
  };
  useEffect(() => { loadAll(); }, []);

  const myTasks = tasks
    .filter((t) => t.assigned_to_user_id === user.user_id || t.assigned_to_user_id === user.id)
    .sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return (order[a.priority] || 4) - (order[b.priority] || 4);
    });
  const criticalTasks = tasks.filter((t) => t.priority === "critical" && t.status !== "done");

  const submitUpdate = async () => {
    if (updateText.trim().length < 5) {
      toast.error("Please describe your day (min 5 chars)");
      return;
    }
    setSubmittingUpdate(true);
    try {
      const { data } = await api.post("/daily-updates", { raw_message: updateText, mood_score: mood });
      toast.success(data.ai_reply || "Update submitted");
      setStreak(data.streak);
      setUpdateText("");
      loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Submit failed");
    } finally { setSubmittingUpdate(false); }
  };

  const roleColor = ROLE_COLOR[user.role];

  const StatCard = ({ label, value, color, testid }) => (
    <div className="stat-card" data-testid={testid}>
      <div className="label-eyebrow">{label}</div>
      <div className="stat-num mt-2" style={{ color: color || "#0F172A" }}>{value}</div>
    </div>
  );

  return (
    <div className="space-y-8" data-testid="dashboard-root">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label-eyebrow" style={{ color: roleColor }}>{ROLE_LABEL[user.role]} Dashboard</div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mt-1">Hello, {user.name?.split(" ")[0]}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-2 px-3 py-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg" data-testid="streak-counter">
            <Fire size={18} weight="fill" color="#F59E0B" />
            <span className="font-mono text-sm font-semibold">{streak}</span>
            <span className="text-xs text-slate-500 dark:text-zinc-400">day streak</span>
          </div>
        </div>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Open tasks" value={summary.open_tasks ?? "—"} testid="stat-open-tasks" />
        <StatCard label="Critical" value={summary.critical ?? "—"} color="#DC2626" testid="stat-critical" />
        <StatCard label="Updates today" value={summary.updates_today ?? "—"} testid="stat-updates-today" />
        <StatCard label="Avg mood" value={summary.avg_mood_today ?? "—"} color="#16A34A" testid="stat-avg-mood" />
      </div>

      {/* HR/Supervisor digest */}
      {["hr", "supervisor", "super_admin"].includes(user.role) && <SLAWidget />}

      {digest && (
        <Card data-testid="ai-digest-card">
          <CardHeader className="flex flex-row items-center gap-2">
            <Sparkle size={18} weight="fill" color="#0D9488" />
            <CardTitle className="text-base">AI Daily Digest</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-700 dark:text-zinc-200 whitespace-pre-wrap">{digest}</CardContent>
        </Card>
      )}

      {/* Daily update form for everyone except super_admin */}
      {user.role !== "super_admin" && (
        <Card data-testid="daily-update-card">
          <CardHeader>
            <CardTitle className="text-base">Submit today's update</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              data-testid="daily-update-text"
              value={updateText}
              onChange={(e) => setUpdateText(e.target.value)}
              placeholder="What did you complete today? Any blockers? Tell us in your own words…"
              rows={3}
            />
            <div className="flex items-center gap-3">
              <Label className="text-xs">Mood:</Label>
              {[1,2,3,4,5].map((n) => (
                <button
                  key={n}
                  data-testid={`mood-${n}`}
                  onClick={() => setMood(n)}
                  className={`w-9 h-9 rounded-md border text-sm font-medium ${mood === n ? "bg-slate-900 text-white border-slate-900" : "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-300"}`}
                >{n}</button>
              ))}
              <Button onClick={submitUpdate} disabled={submittingUpdate} className="ml-auto" data-testid="submit-update">
                {submittingUpdate ? "Submitting..." : "Submit & AI parse"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* My tasks */}
      {myTasks.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold tracking-tight">My tasks</h2>
            <Button variant="ghost" size="sm" onClick={() => nav("/tasks")} data-testid="view-all-tasks">View all</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {myTasks.slice(0, 6).map((t) => (
              <TaskCard key={t.id} task={t} onChange={loadAll} onEscalate={setEscalateTask} />
            ))}
          </div>
        </section>
      )}

      {/* Supervisor/HR people grid */}
      {["supervisor", "hr", "super_admin"].includes(user.role) && people.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold tracking-tight mb-3">Team</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {people.filter((p) => p.id !== user.user_id).slice(0, 8).map((p) => (
              <div key={p.id} className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg p-3" data-testid={`person-card-${p.id}`}>
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-md flex items-center justify-center text-white text-sm font-semibold" style={{ background: ROLE_COLOR[p.role] }}>
                    {p.name?.[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-xs text-slate-500 dark:text-zinc-400">{ROLE_LABEL[p.role]}</div>
                  </div>
                </div>
                {p.streak_count > 0 && (
                  <div className="mt-2 text-xs text-slate-500 dark:text-zinc-400 flex items-center gap-1">
                    <Fire size={12} weight="fill" color="#F59E0B" /> {p.streak_count}-day streak
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Critical tasks */}
      {criticalTasks.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold tracking-tight mb-3 text-red-700 flex items-center gap-2">
            <Trophy size={18} /> Critical right now
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {criticalTasks.map((t) => (
              <TaskCard key={t.id} task={t} onChange={loadAll} onEscalate={setEscalateTask} canEdit={false} />
            ))}
          </div>
        </section>
      )}

      <PriorityModal
        open={!!escalateTask}
        onOpenChange={(o) => !o && setEscalateTask(null)}
        task={escalateTask}
        otherTasks={tasks.filter((t) => t.assigned_to_user_id === (escalateTask?.assigned_to_user_id))}
        onSaved={loadAll}
      />
    </div>
  );
}
