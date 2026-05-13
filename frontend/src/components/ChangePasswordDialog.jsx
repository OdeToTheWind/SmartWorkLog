import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { api } from "../lib/api";
import { toast } from "sonner";
import { EyeIcon, EyeSlashIcon, LockKeyIcon } from "@phosphor-icons/react";

export default function ChangePasswordDialog({ open, onOpenChange }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setCurrent(""); setNext(""); setConfirm("");
    setShowCurrent(false); setShowNext(false);
  };

  const handleClose = (v) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (next.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    if (next !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    if (current === next) {
      toast.error("New password must be different from current password");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/change-password", { current_password: current, new_password: next });
      toast.success("Password changed successfully");
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to change password");
    } finally {
      setLoading(false);
    }
  };

  const strength = (() => {
    if (!next) return { label: "", color: "" };
    let s = 0;
    if (next.length >= 8) s++;
    if (next.length >= 12) s++;
    if (/[A-Z]/.test(next) && /[a-z]/.test(next)) s++;
    if (/\d/.test(next)) s++;
    if (/[^A-Za-z0-9]/.test(next)) s++;
    if (s <= 2) return { label: "Weak", color: "text-red-600 bg-red-100" };
    if (s === 3) return { label: "Fair", color: "text-amber-600 bg-amber-100" };
    if (s === 4) return { label: "Good", color: "text-blue-600 bg-blue-100" };
    return { label: "Strong", color: "text-emerald-600 bg-emerald-100" };
  })();

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md" data-testid="change-password-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LockKeyIcon size={20} weight="duotone" /> Change Password
          </DialogTitle>
          <DialogDescription>
            Update your account password. You'll stay signed in on this device.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cp-current">Current password</Label>
            <div className="relative">
              <Input
                id="cp-current"
                data-testid="cp-current-input"
                type={showCurrent ? "text" : "password"}
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                placeholder="Enter your current password"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                data-testid="cp-toggle-current"
                onClick={() => setShowCurrent((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:text-zinc-200"
              >
                {showCurrent ? <EyeSlashIcon size={16} /> : <EyeIcon size={16} />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="cp-new">New password</Label>
              {strength.label && (
                <span data-testid="cp-strength" className={`text-xs px-2 py-0.5 rounded ${strength.color}`}>
                  {strength.label}
                </span>
              )}
            </div>
            <div className="relative">
              <Input
                id="cp-new"
                data-testid="cp-new-input"
                type={showNext ? "text" : "password"}
                value={next}
                onChange={(e) => setNext(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                data-testid="cp-toggle-new"
                onClick={() => setShowNext((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:text-zinc-200"
              >
                {showNext ? <EyeSlashIcon size={16} /> : <EyeIcon size={16} />}
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400">Use 8+ characters with a mix of letters, numbers and symbols.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cp-confirm">Confirm new password</Label>
            <Input
              id="cp-confirm"
              data-testid="cp-confirm-input"
              type={showNext ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter new password"
              autoComplete="new-password"
              required
            />
            {confirm && next !== confirm && (
              <p className="text-xs text-red-600">Passwords do not match</p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => handleClose(false)} data-testid="cp-cancel-btn">
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !current || !next || !confirm} data-testid="cp-submit-btn">
              {loading ? "Updating..." : "Update password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
