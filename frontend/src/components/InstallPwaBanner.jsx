import React, { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { DownloadSimpleIcon, XIcon } from "@phosphor-icons/react";

// Listens to beforeinstallprompt (Chrome/Edge/Samsung Internet on Android) and
// shows a small inline bar inviting the user to add the PWA to their home screen.
export default function InstallPwaBanner() {
  const [deferred, setDeferred] = useState(null);
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem("worklog_pwa_dismissed") === "1"; } catch { return false; }
  });

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferred(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // Hide on iOS standalone or already installed
  useEffect(() => {
    if (window.matchMedia?.("(display-mode: standalone)").matches) setHidden(true);
  }, []);

  if (!deferred || hidden) return null;

  const install = async () => {
    try {
      deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice?.outcome === "accepted") {
        setHidden(true);
      }
    } catch (e) {
      // user dismissed
    } finally {
      setDeferred(null);
    }
  };

  const dismiss = () => {
    setHidden(true);
    try { localStorage.setItem("worklog_pwa_dismissed", "1"); } catch {}
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-50 ai-gradient text-white rounded-xl shadow-2xl p-3 flex items-center gap-3" data-testid="pwa-install-banner">
      <DownloadSimpleIcon size={22} weight="fill" className="flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">Install Smart WorkLog</div>
        <div className="text-xs opacity-90 truncate">Add to your home screen for a native app feel.</div>
      </div>
      <Button onClick={install} size="sm" variant="secondary" className="flex-shrink-0 text-slate-900" data-testid="pwa-install-btn">
        Install
      </Button>
      <button onClick={dismiss} data-testid="pwa-dismiss-btn" className="p-1 opacity-80 hover:opacity-100" aria-label="Dismiss">
        <XIcon size={16} weight="bold" />
      </button>
    </div>
  );
}
