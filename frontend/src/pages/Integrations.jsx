import React, { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { toast } from "sonner";
import {
  PlugIcon as Plug, CheckCircleIcon as CheckCircle, ArrowsClockwiseIcon as Sync,
  WarningCircleIcon as Warning, LinkBreakIcon as Unlink, SparkleIcon as Sparkle
} from "@phosphor-icons/react";

export default function Integrations() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const [jira, setJira] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/integrations/jira/status");
      setJira(data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to load Jira status");
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle OAuth callback (code + state from Atlassian)
  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    if (code && state) {
      setBusy(true);
      api.post("/integrations/jira/callback", { code, state })
        .then(({ data }) => {
          toast.success(`Jira connected: ${data.site || "OK"}`);
          window.history.replaceState({}, document.title, "/integrations");
          refresh();
        })
        .catch((err) => toast.error(err?.response?.data?.detail || "Connection failed"))
        .finally(() => setBusy(false));
    } else {
      refresh();
    }
  }, [searchParams, refresh]);

  const connect = async () => {
    setBusy(true);
    try {
      const { data } = await api.get("/integrations/jira/auth-url");
      window.location.href = data.auth_url;
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not initiate Jira connection");
      setBusy(false);
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post("/integrations/jira/sync");
      toast.success(`Synced ${data.synced} Jira issues into Tasks`);
      refresh();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm("Disconnect Jira? Synced tasks remain.")) return;
    setBusy(true);
    try {
      await api.post("/integrations/jira/disconnect");
      toast.success("Jira disconnected");
      refresh();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to disconnect");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="text-sm text-slate-500 dark:text-zinc-400">Loading integrations…</div>;

  const canSeeDev = ["developer", "team_member", "supervisor", "hr", "super_admin"].includes(user.role);

  return (
    <div className="max-w-3xl space-y-6" data-testid="integrations-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
          Connect external tools so they appear in your tasks automatically.
        </p>
      </div>

      <Card data-testid="jira-card" className="dark:border-zinc-800 dark:bg-zinc-900">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold" style={{ background: "#0052CC" }}>
                Jira
              </div>
              <div>
                <CardTitle className="text-base">Atlassian Jira</CardTitle>
                <CardDescription>
                  One-way read-only sync of your assigned Jira issues into Smart WorkLog tasks.
                </CardDescription>
              </div>
            </div>
            {jira?.connected ? (
              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800" data-testid="jira-connected-badge">
                <CheckCircle size={12} weight="fill" className="mr-1" /> Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="dark:border-zinc-700 dark:text-zinc-400">Not connected</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!jira?.configured && (
            <div className="flex items-start gap-2 text-sm bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded p-3 text-amber-800 dark:text-amber-200" data-testid="jira-not-configured">
              <Warning size={18} className="mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium">Jira not configured on this server</div>
                <div className="text-xs mt-1">
                  Ask an admin to set <code className="font-mono">JIRA_CLIENT_ID</code>, <code className="font-mono">JIRA_CLIENT_SECRET</code> and <code className="font-mono">JIRA_REDIRECT_URI</code> in <code className="font-mono">backend/.env</code>. See <code className="font-mono">ENV_REFERENCE.md</code> for the Atlassian Developer Console setup.
                </div>
              </div>
            </div>
          )}

          {jira?.connected && (
            <div className="text-sm space-y-1" data-testid="jira-connection-details">
              <div className="flex justify-between"><span className="text-slate-500 dark:text-zinc-400">Workspace</span><span className="font-medium">{jira.site}</span></div>
              <div className="flex justify-between"><span className="text-slate-500 dark:text-zinc-400">Jira account</span><span className="font-medium">{jira.email}</span></div>
              <div className="flex justify-between"><span className="text-slate-500 dark:text-zinc-400">Last sync</span><span className="font-medium">{jira.last_synced_at ? new Date(jira.last_synced_at).toLocaleString() : "Never"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500 dark:text-zinc-400">Last issue count</span><span className="font-medium">{jira.issue_count}</span></div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            {!jira?.connected ? (
              <Button onClick={connect} disabled={busy || !jira?.configured} className="ai-gradient" data-testid="jira-connect-btn">
                <Plug size={16} className="mr-1" /> {busy ? "Connecting…" : "Connect Jira"}
              </Button>
            ) : (
              <>
                {canSeeDev && (
                  <Button onClick={sync} disabled={syncing} className="ai-gradient" data-testid="jira-sync-btn">
                    <Sync size={16} className={syncing ? "mr-1 animate-spin" : "mr-1"} />
                    {syncing ? "Syncing…" : "Sync now"}
                  </Button>
                )}
                <Button onClick={disconnect} disabled={busy} variant="outline" data-testid="jira-disconnect-btn">
                  <Unlink size={16} className="mr-1" /> Disconnect
                </Button>
              </>
            )}
            <Button variant="ghost" onClick={() => nav("/tasks")} data-testid="jira-view-tasks-btn">
              View synced tasks
            </Button>
          </div>

          <div className="text-xs text-slate-500 dark:text-zinc-500 pt-3 border-t border-slate-100 dark:border-zinc-800">
            <Sparkle size={12} weight="fill" className="inline text-violet-500 mr-1" />
            Each sync fetches your unfinished issues (max 200) and mirrors them as technical tasks with priority mapped from Jira (Highest→Critical, High→High, etc.).
            Jira remains the source of truth — edits to synced tasks here will be overwritten on next sync.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
