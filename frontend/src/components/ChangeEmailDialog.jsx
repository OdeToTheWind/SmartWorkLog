import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import { EnvelopeSimpleIcon, EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";

export default function ChangeEmailDialog({ open, onOpenChange }) {
  const { user, setSession } = useAuth();
  const [password, setPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  const reset = () => { setPassword(""); setNewEmail(""); setShowPwd(false); };
  const handleClose = (v) => { if (!v) reset(); onOpenChange(v); };

  const submit = async (e) => {
    e.preventDefault();
    const trimmed = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error("Please enter a valid email"); return;
    }
    if (trimmed === (user?.email || "").toLowerCase()) {
      toast.error("New email must be different from current email"); return;
    }
    setLoading(true);
    try {
      const { data } = await api.post("/auth/change-email", { current_password: password, new_email: trimmed });
      if (data?.token && data?.user && typeof setSession === "function") {
        setSession(data.token, data.user);
      } else if (data?.token) {
        // Fallback: persist directly so the user isn't logged out
        localStorage.setItem("worklog_token", data.token);
        if (data.user) localStorage.setItem("worklog_user", JSON.stringify(data.user));
      }
      toast.success("Email updated successfully");
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to change email");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md" data-testid="change-email-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <EnvelopeSimpleIcon size={20} weight="duotone" /> Change Email
          </DialogTitle>
          <DialogDescription>
            Update the email used to sign in. Current: <span className="font-medium">{user?.email}</span>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ce-new">New email</Label>
            <Input
              id="ce-new"
              data-testid="ce-new-email-input"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ce-pwd">Confirm with password</Label>
            <div className="relative">
              <Input
                id="ce-pwd"
                data-testid="ce-password-input"
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your current password"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                data-testid="ce-toggle-pwd"
                onClick={() => setShowPwd((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-700"
              >
                {showPwd ? <EyeSlashIcon size={16} /> : <EyeIcon size={16} />}
              </button>
            </div>
            <p className="text-xs text-slate-500">We require your password to confirm this change.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => handleClose(false)} data-testid="ce-cancel-btn">Cancel</Button>
            <Button type="submit" disabled={loading || !password || !newEmail} data-testid="ce-submit-btn">
              {loading ? "Updating..." : "Update email"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
