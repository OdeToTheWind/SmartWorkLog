import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n, LANGUAGES } from "../lib/i18n";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { toast } from "sonner";

export default function History() {
  const { user } = useAuth();
  const { lang, setLang, t } = useI18n();
  const [trend, setTrend] = useState([]);
  const [updates, setUpdates] = useState([]);
  const [telegramId, setTelegramId] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [tr, du] = await Promise.all([
          api.get("/dashboard/mood-trend", { params: { days: 30 } }),
          api.get("/daily-updates", { params: { days: 90 } }),
        ]);
        setTrend(tr.data);
        setUpdates(du.data);
      } catch (e) {}
      try {
        const me = await api.get("/auth/me");
        setTelegramId(me.data.telegram_id || "");
      } catch {}
    })();
  }, []);

  // Build 30-day heatmap matrix (last 30 days)
  const last30 = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const has = updates.find((u) => u.date === iso);
    last30.push({ date: iso, mood: has?.mood_score || 0, has: !!has });
  }
  const heatColor = (mood) => {
    if (!mood) return "bg-slate-100";
    if (mood >= 5) return "bg-emerald-500";
    if (mood >= 4) return "bg-emerald-400";
    if (mood >= 3) return "bg-amber-400";
    if (mood >= 2) return "bg-orange-400";
    return "bg-red-500";
  };

  const linkTelegram = async () => {
    if (!telegramId.trim()) { toast.error("Enter your Telegram chat ID"); return; }
    try {
      await api.post("/telegram/link", { telegram_id: telegramId.trim() });
      toast.success("Telegram linked (will be active once bot token is set)");
    } catch (e) { toast.error("Failed"); }
  };

  return (
    <div className="space-y-6 max-w-4xl" data-testid="history-page">
      <h1 className="text-3xl font-bold tracking-tight">{t("history")} & {t("profile")}</h1>

      <Card data-testid="mood-trend-card">
        <CardHeader><CardTitle className="text-base">30-day mood trend</CardTitle></CardHeader>
        <CardContent>
          {trend.length === 0 ? (
            <div className="text-sm text-slate-500 py-8 text-center">Submit a few daily updates to see your trend.</div>
          ) : (
            <div style={{ width: "100%", height: 220 }}>
              <ResponsiveContainer>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="avg_mood" stroke="#0D9488" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="mood-heatmap-card">
        <CardHeader><CardTitle className="text-base">Activity heatmap (last 30 days)</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-10 sm:grid-cols-15 gap-1.5">
            {last30.map((d) => (
              <div key={d.date}
                title={`${d.date}: ${d.has ? `mood ${d.mood}` : "no update"}`}
                className={`aspect-square rounded ${heatColor(d.mood)}`}
                data-testid={`heat-${d.date}`} />
            ))}
          </div>
          <div className="flex items-center gap-2 mt-4 text-xs text-slate-500">
            <span>Less</span>
            <span className="w-3 h-3 rounded bg-slate-100" />
            <span className="w-3 h-3 rounded bg-orange-400" />
            <span className="w-3 h-3 rounded bg-amber-400" />
            <span className="w-3 h-3 rounded bg-emerald-400" />
            <span className="w-3 h-3 rounded bg-emerald-500" />
            <span>More</span>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="language-card">
        <CardHeader><CardTitle className="text-base">{t("language")}</CardTitle></CardHeader>
        <CardContent>
          <Select value={lang} onValueChange={setLang}>
            <SelectTrigger className="w-full max-w-xs" data-testid="lang-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((l) => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="text-xs text-slate-500 mt-2">Telegram replies and AI-generated text use this language.</div>
        </CardContent>
      </Card>

      <Card data-testid="telegram-card">
        <CardHeader><CardTitle className="text-base">Telegram (MOCKED until bot token is set)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Label className="text-xs">Your Telegram chat ID</Label>
          <Input value={telegramId} onChange={(e) => setTelegramId(e.target.value)} placeholder="e.g. 123456789" data-testid="telegram-id-input" />
          <Button onClick={linkTelegram} data-testid="telegram-link-btn">Link Telegram</Button>
          <div className="text-xs text-slate-500">After deployment, set TELEGRAM_BOT_TOKEN env and configure the webhook → <code>/api/telegram/webhook</code>.</div>
        </CardContent>
      </Card>
    </div>
  );
}
