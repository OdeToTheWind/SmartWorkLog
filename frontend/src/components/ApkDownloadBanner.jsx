import React, { useEffect, useState } from "react";
import axios from "axios";
import { DownloadSimpleIcon, DeviceMobileIcon } from "@phosphor-icons/react";
import { toast } from "sonner";

// Temporary, public APK download banner — visible to all users.
// Only renders when the backend confirms the build artifact is present.
// Remove this component once distribution moves to Play Store / Drive link.
export default function ApkDownloadBanner() {
  const [status, setStatus] = useState(null);
  const [hidden, setHidden] = useState(() => {
    try { return sessionStorage.getItem("worklog_apk_hidden") === "1"; } catch { return false; }
  });

  useEffect(() => {
    const url = `${process.env.REACT_APP_BACKEND_URL}/api/download/apk-status`;
    axios.get(url).then((r) => setStatus(r.data)).catch(() => setStatus({ available: false }));
  }, []);

  if (!status?.available || hidden) return null;

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = `${process.env.REACT_APP_BACKEND_URL}/api/download/apk`;
    a.download = "SmartWorkLog.apk";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success(`Downloading SmartWorkLog.apk (${status.size_mb} MB)`);
  };

  const dismiss = () => {
    setHidden(true);
    try { sessionStorage.setItem("worklog_apk_hidden", "1"); } catch {}
  };

  return (
    <div className="rounded-xl ai-gradient p-4 text-white shadow-lg flex items-center gap-3" data-testid="apk-download-banner">
      <DeviceMobileIcon size={28} weight="duotone" className="flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm">Android app available for testing</div>
        <div className="text-xs opacity-90">
          Install the Smart WorkLog APK on your Android phone ({status.size_mb} MB) — internal testing build.
        </div>
      </div>
      <button
        onClick={handleDownload}
        data-testid="apk-download-btn"
        className="bg-white/95 text-slate-900 hover:bg-white text-sm font-medium px-3 py-1.5 rounded-md flex items-center gap-1.5 flex-shrink-0"
      >
        <DownloadSimpleIcon size={16} weight="bold" /> Download APK
      </button>
      <button
        onClick={dismiss}
        data-testid="apk-dismiss-btn"
        className="text-white/80 hover:text-white text-xs px-1 flex-shrink-0"
        aria-label="Hide for this session"
      >
        ✕
      </button>
    </div>
  );
}
