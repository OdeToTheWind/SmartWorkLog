import React, { useState } from "react";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { Sparkle } from "@phosphor-icons/react";

export default function DailyUpdate() {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [mood, setMood] = useState(4);
  const [blocker, setBlocker] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiReply, setAiReply] = useState("");

  const submit = async () => {
    if (text.trim().length < 5) { toast.error("Tell us more about your day"); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/daily-updates", { raw_message: text, mood_score: mood, blocker_text: blocker || null });
      setAiReply(data.ai_reply);
      toast.success("Update submitted");
      setText(""); setBlocker("");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    } finally { setBusy(false); }
  };
  return (
    <div className="max-w-2xl space-y-6" data-testid="daily-update-page">
      <h1 className="text-3xl font-bold tracking-tight">Daily update</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">How was your day, {user.name?.split(" ")[0]}?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            data-testid="du-text"
            rows={5}
            placeholder="Type freely — AI will parse mood, urgency and a summary."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex items-center gap-3">
            <Label className="text-xs">Mood</Label>
            {[1,2,3,4,5].map((n) => (
              <button key={n} data-testid={`du-mood-${n}`} onClick={() => setMood(n)} className={`w-9 h-9 rounded-md border text-sm ${mood === n ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-200"}`}>{n}</button>
            ))}
          </div>
          <div>
            <Label>Blocker (optional)</Label>
            <Textarea rows={2} value={blocker} onChange={(e) => setBlocker(e.target.value)} placeholder="What's blocking you?" data-testid="du-blocker" />
          </div>
          <Button onClick={submit} disabled={busy} data-testid="du-submit">{busy ? "Submitting..." : "Submit & AI parse"}</Button>
        </CardContent>
      </Card>
      {aiReply && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Sparkle size={16} weight="fill" color="#0D9488" />
            <CardTitle className="text-base">AI replied</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-700">{aiReply}</CardContent>
        </Card>
      )}
    </div>
  );
}
