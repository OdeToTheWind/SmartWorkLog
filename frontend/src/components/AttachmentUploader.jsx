import React, { useRef, useState } from "react";
import { api } from "../lib/api";
import { Button } from "./ui/button";
import { Paperclip, X } from "lucide-react";
import { toast } from "sonner";

export default function AttachmentUploader({ taskId, dailyUpdateDate, onUploaded, max = 3 }) {
  const ref = useRef();
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);

  const pick = () => ref.current?.click();
  const onChange = async (e) => {
    const files = Array.from(e.target.files || []).slice(0, max - items.length);
    if (!files.length) return;
    setBusy(true);
    try {
      for (const f of files) {
        const fd = new FormData(); fd.append("file", f);
        const params = {};
        if (taskId) params.task_id = taskId;
        if (dailyUpdateDate) params.daily_update_date = dailyUpdateDate;
        const { data } = await api.post("/files/upload", fd, { params, headers: { "Content-Type": "multipart/form-data" } });
        setItems((it) => [...it, data]);
        onUploaded && onUploaded(data);
      }
      toast.success(`${files.length} file(s) uploaded`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Upload failed");
    } finally { setBusy(false); ref.current.value = ""; }
  };

  const remove = async (id) => {
    try { await api.delete(`/files/${id}`); setItems((it) => it.filter((f) => f.id !== id)); } catch {}
  };

  return (
    <div className="space-y-2" data-testid="attachment-uploader">
      <input ref={ref} type="file" accept="image/*,.pdf" multiple hidden onChange={onChange} data-testid="file-input" />
      <Button variant="outline" size="sm" type="button" onClick={pick} disabled={busy || items.length >= max} data-testid="attach-btn">
        <Paperclip size={14} className="mr-1" /> Attach ({items.length}/{max})
      </Button>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {items.map((f) => (
            <div key={f.id} className="inline-flex items-center gap-1.5 bg-slate-100 dark:bg-zinc-800 rounded-md px-2 py-1 text-xs" data-testid={`attached-${f.id}`}>
              <span className="truncate max-w-[160px]">{f.original_filename}</span>
              <button onClick={() => remove(f.id)} className="text-slate-500 dark:text-zinc-400 hover:text-red-600"><X size={12} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
