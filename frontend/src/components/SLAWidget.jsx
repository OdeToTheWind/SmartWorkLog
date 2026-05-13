import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { Timer, AlertTriangle, CheckCircle } from "lucide-react";

export default function SLAWidget() {
  const [sla, setSla] = useState(null);
  useEffect(() => {
    (async () => {
      try { const { data } = await api.get("/dashboard/sla"); setSla(data); } catch {}
    })();
  }, []);
  if (!sla) return null;

  const compliant = sla.compliance_pct >= 80;
  return (
    <Card data-testid="sla-widget" className="border-slate-200 dark:border-zinc-800">
      <CardHeader className="flex flex-row items-center gap-2">
        <Timer size={18} className={compliant ? "text-emerald-600" : "text-red-600"} />
        <CardTitle className="text-base">Critical-task SLA (30 days)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="label-eyebrow">Avg ack time</div>
            <div className="stat-num mt-1" style={{ color: compliant ? "#0F172A" : "#DC2626" }}>
              {sla.avg_ack_minutes}<span className="text-base text-slate-500 dark:text-zinc-400 font-normal ml-1">min</span>
            </div>
          </div>
          <div>
            <div className="label-eyebrow">Compliance</div>
            <div className="stat-num mt-1" style={{ color: compliant ? "#16A34A" : "#D97706" }}>{sla.compliance_pct}%</div>
          </div>
          <div>
            <div className="label-eyebrow">Critical (30d)</div>
            <div className="stat-num mt-1">{sla.total_critical_30d}</div>
          </div>
          <div>
            <div className="label-eyebrow">Unack now</div>
            <div className="stat-num mt-1" style={{ color: sla.currently_unacknowledged ? "#DC2626" : "#0F172A" }}>
              {sla.currently_unacknowledged}
            </div>
          </div>
        </div>
        <div className="mt-4 text-xs text-slate-500 dark:text-zinc-400 flex items-center gap-2">
          {compliant ? <CheckCircle size={14} className="text-emerald-600" /> : <AlertTriangle size={14} className="text-red-600" />}
          <span>SLA target: acknowledge within 30 minutes. {sla.over_30min_count} breaches in last 30 days.</span>
        </div>
      </CardContent>
    </Card>
  );
}
