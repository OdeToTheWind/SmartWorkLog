import React, { useState } from "react";
import { api } from "../lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { toast } from "sonner";

export default function GdprPurgeDialog({ open, onOpenChange, user, onPurged }) {
  const [step, setStep] = useState(1);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (confirm !== "DELETE PERMANENTLY") { toast.error("Type the exact phrase to confirm"); return; }
    setBusy(true);
    try {
      const { data } = await api.delete(`/users/${user.id}/purge`, { data: { confirmation_text: confirm } });
      toast.success(`Purged: ${JSON.stringify(data.purged)}`);
      setStep(1); setConfirm("");
      onPurged && onPurged();
      onOpenChange(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Purge failed");
    } finally { setBusy(false); }
  };

  if (!user) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setStep(1); setConfirm(""); } }}>
      <DialogContent data-testid="gdpr-dialog">
        <DialogHeader><DialogTitle className="text-red-700">GDPR — permanent delete</DialogTitle></DialogHeader>
        {step === 1 ? (
          <div className="space-y-3">
            <p className="text-sm">You're about to <strong>permanently delete</strong> all data for:</p>
            <div className="bg-slate-100 p-3 rounded text-sm">
              <div className="font-medium">{user.name}</div>
              <div className="text-xs text-slate-500">{user.email} · {user.role}</div>
            </div>
            <p className="text-xs text-slate-600">This removes: account, tasks, daily updates, leave, notifications, audit entries (for/by this user), attachments. <strong>Irreversible.</strong></p>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button variant="destructive" onClick={() => setStep(2)} data-testid="gdpr-next">Continue</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <Label className="text-xs">Type <code className="bg-slate-100 px-1.5 py-0.5 rounded">DELETE PERMANENTLY</code> to confirm</Label>
            <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} data-testid="gdpr-confirm-input" />
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button variant="destructive" onClick={submit} disabled={busy || confirm !== "DELETE PERMANENTLY"} data-testid="gdpr-confirm-btn">
                {busy ? "Purging..." : "Permanently delete"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
