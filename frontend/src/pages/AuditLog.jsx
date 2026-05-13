import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../components/ui/table";
import { Badge } from "../components/ui/badge";

export default function AuditLog() {
  const [items, setItems] = useState([]);
  useEffect(() => { (async () => { const { data } = await api.get("/audit-log"); setItems(data); })(); }, []);
  return (
    <div className="space-y-6" data-testid="audit-page">
      <h1 className="text-3xl font-bold tracking-tight">Audit Log</h1>
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">When</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-slate-500 dark:text-zinc-400 py-8">No audit entries yet.</TableCell></TableRow>
            )}
            {items.map((a) => (
              <TableRow key={a.id} data-testid={`audit-row-${a.id}`}>
                <TableCell className="font-mono text-xs">{new Date(a.timestamp).toLocaleString()}</TableCell>
                <TableCell><Badge variant="outline" className="uppercase tracking-wider text-[10px]">{a.action_type}</Badge></TableCell>
                <TableCell className="text-xs max-w-xs truncate">{a.reason || "—"}</TableCell>
                <TableCell className="text-xs text-slate-600 dark:text-zinc-300 max-w-md truncate">{JSON.stringify(a.new_value)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
