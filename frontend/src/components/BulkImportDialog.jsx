import React, { useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { api } from "../lib/api";
import { toast } from "sonner";
import { UploadSimpleIcon, FileCsvIcon, CheckCircleIcon, WarningCircleIcon, XCircleIcon, DownloadSimpleIcon } from "@phosphor-icons/react";

const REQUIRED_COLS = ["name", "email"];
const OPTIONAL_COLS = ["password", "role", "team_name", "supervisor_email", "timezone", "language", "telegram_id"];
const ALL_COLS = [...REQUIRED_COLS, ...OPTIONAL_COLS];

// Minimal RFC-4180-ish CSV parser (handles quoted fields, escaped quotes, CRLF)
function parseCSV(text) {
  const rows = [];
  let i = 0, field = "", row = [], inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\n" || c === "\r") {
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      if (c === "\r" && text[i + 1] === "\n") i++;
      i++; continue;
    }
    field += c; i++;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function rowsToObjects(rows) {
  if (!rows.length) return { headers: [], data: [] };
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const data = rows.slice(1).filter((r) => r.some((c) => (c || "").trim() !== "")).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (r[idx] ?? "").trim(); });
    return obj;
  });
  return { headers, data };
}

const SAMPLE_CSV = `name,email,role,team_name,supervisor_email,timezone,language,password
Aisha Khan,aisha@acme.com,supervisor,Engineering,,Asia/Kolkata,en,
Ravi Patel,ravi@acme.com,developer,Engineering,aisha@acme.com,Asia/Kolkata,en,
Maya Singh,maya@acme.com,employee,Marketing,,UTC,en,welcome@123
`;

export default function BulkImportDialog({ open, onOpenChange, onImported }) {
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState(null); // { headers, data }
  const [parseError, setParseError] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [createMissingTeams, setCreateMissingTeams] = useState(true);
  const inputRef = useRef(null);

  const reset = () => {
    setFileName(""); setParsed(null); setParseError("");
    setLoading(false); setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  };
  const handleClose = (v) => { if (!v) reset(); onOpenChange(v); };

  const handleFile = (file) => {
    if (!file) return;
    setParseError(""); setResult(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || "");
        const rows = parseCSV(text);
        const { headers, data } = rowsToObjects(rows);
        const missing = REQUIRED_COLS.filter((c) => !headers.includes(c));
        if (missing.length) {
          setParseError(`Missing required column(s): ${missing.join(", ")}`);
          setParsed(null);
          return;
        }
        if (data.length === 0) {
          setParseError("CSV has no data rows.");
          setParsed(null);
          return;
        }
        if (data.length > 500) {
          setParseError(`Too many rows (${data.length}). Maximum 500 per import.`);
          setParsed(null);
          return;
        }
        setParsed({ headers, data });
      } catch (e) {
        setParseError("Could not parse CSV: " + (e?.message || "unknown error"));
        setParsed(null);
      }
    };
    reader.readAsText(file);
  };

  const submit = async () => {
    if (!parsed?.data?.length) return;
    setLoading(true);
    try {
      const rows = parsed.data.map((r) => ({
        name: r.name,
        email: r.email,
        password: r.password || undefined,
        role: r.role || "employee",
        team_name: r.team_name || undefined,
        supervisor_email: r.supervisor_email || undefined,
        timezone: r.timezone || "UTC",
        language: r.language || "en",
        telegram_id: r.telegram_id || undefined,
      }));
      const { data } = await api.post("/users/bulk-import", { rows, create_missing_teams: createMissingTeams });
      setResult(data);
      const s = data?.summary || {};
      toast.success(`Imported ${s.created || 0} of ${s.total || 0} users`);
      if (typeof onImported === "function") onImported();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Bulk import failed");
    } finally {
      setLoading(false);
    }
  };

  const downloadSample = () => {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "worklog_people_template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadCreatedCsv = () => {
    if (!result?.created?.length) return;
    const header = "row,email,name,role,temp_password\n";
    const body = result.created.map((c) => [c.row, c.email, c.name, c.role, c.temp_password || ""].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "worklog_created_users.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const previewRows = useMemo(() => (parsed?.data || []).slice(0, 5), [parsed]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="bulk-import-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCsvIcon size={20} weight="duotone" /> Bulk Import People
          </DialogTitle>
          <DialogDescription>
            Upload a CSV file to onboard up to 500 people at once. Required columns: <code className="font-mono">name</code>, <code className="font-mono">email</code>.
          </DialogDescription>
        </DialogHeader>

        {!result && (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-slate-300 dark:border-zinc-700 rounded-lg p-6 text-center bg-slate-50 dark:bg-zinc-950">
              <UploadSimpleIcon size={28} className="mx-auto text-slate-400 dark:text-zinc-500" />
              <p className="text-sm text-slate-600 dark:text-zinc-300 mt-2">Choose a CSV file to import</p>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => handleFile(e.target.files?.[0])}
                className="hidden"
                data-testid="bulk-csv-input"
              />
              <div className="flex flex-wrap gap-2 justify-center mt-3">
                <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} data-testid="bulk-choose-file-btn">
                  {fileName ? "Replace file" : "Choose CSV"}
                </Button>
                <Button variant="ghost" size="sm" onClick={downloadSample} data-testid="bulk-template-btn">
                  <DownloadSimpleIcon size={14} className="mr-1" /> Download template
                </Button>
              </div>
              {fileName && <p className="text-xs text-slate-500 dark:text-zinc-400 mt-2 truncate">Selected: {fileName}</p>}
            </div>

            <div className="text-xs text-slate-600 dark:text-zinc-300 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded p-3">
              <div className="font-semibold mb-1">Columns</div>
              <div><span className="text-red-600">required</span>: {REQUIRED_COLS.join(", ")}</div>
              <div><span className="text-slate-500 dark:text-zinc-400">optional</span>: {OPTIONAL_COLS.join(", ")}</div>
              <div className="mt-1">Allowed roles: <code className="font-mono">employee, team_member, developer, supervisor, hr</code>. If <code>password</code> is empty, a temporary one is generated and returned.</div>
            </div>

            {parseError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700" data-testid="bulk-parse-error">
                <WarningCircleIcon size={18} className="mt-0.5 flex-shrink-0" /> <span>{parseError}</span>
              </div>
            )}

            {parsed && (
              <div className="space-y-2" data-testid="bulk-preview">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Preview ({parsed.data.length} rows)</Label>
                  <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-zinc-300">
                    <input
                      type="checkbox"
                      checked={createMissingTeams}
                      onChange={(e) => setCreateMissingTeams(e.target.checked)}
                      data-testid="bulk-create-teams-checkbox"
                    />
                    Auto-create missing teams
                  </label>
                </div>
                <div className="overflow-x-auto border border-slate-200 dark:border-zinc-800 rounded">
                  <table className="text-xs w-full">
                    <thead className="bg-slate-50 dark:bg-zinc-950">
                      <tr>
                        {ALL_COLS.filter((c) => parsed.headers.includes(c)).map((c) => (
                          <th key={c} className="px-2 py-1.5 text-left font-medium text-slate-600 dark:text-zinc-300">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((r, i) => (
                        <tr key={i} className="border-t border-slate-100 dark:border-zinc-800">
                          {ALL_COLS.filter((c) => parsed.headers.includes(c)).map((c) => (
                            <td key={c} className="px-2 py-1.5 truncate max-w-[160px]">{r[c] || <span className="text-slate-300">—</span>}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parsed.data.length > 5 && <p className="text-xs text-slate-500 dark:text-zinc-400">…and {parsed.data.length - 5} more</p>}
              </div>
            )}
          </div>
        )}

        {result && (
          <div className="space-y-3" data-testid="bulk-result">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-emerald-50 border border-emerald-200 rounded p-3">
                <CheckCircleIcon size={20} className="mx-auto text-emerald-600" />
                <div className="text-2xl font-semibold text-emerald-700" data-testid="bulk-created-count">{result.summary.created}</div>
                <div className="text-xs text-emerald-700">Created</div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded p-3">
                <WarningCircleIcon size={20} className="mx-auto text-amber-600" />
                <div className="text-2xl font-semibold text-amber-700" data-testid="bulk-skipped-count">{result.summary.skipped}</div>
                <div className="text-xs text-amber-700">Skipped</div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded p-3">
                <XCircleIcon size={20} className="mx-auto text-red-600" />
                <div className="text-2xl font-semibold text-red-700" data-testid="bulk-errors-count">{result.summary.errors}</div>
                <div className="text-xs text-red-700">Errors</div>
              </div>
            </div>

            {result.created.length > 0 && (
              <details className="text-sm" open>
                <summary className="cursor-pointer font-medium text-slate-700 dark:text-zinc-200 py-1">View created users ({result.created.length})</summary>
                <div className="mt-2 max-h-56 overflow-y-auto border border-slate-200 dark:border-zinc-800 rounded">
                  <table className="text-xs w-full">
                    <thead className="bg-slate-50 dark:bg-zinc-950 sticky top-0"><tr>
                      <th className="px-2 py-1.5 text-left">Email</th>
                      <th className="px-2 py-1.5 text-left">Role</th>
                      <th className="px-2 py-1.5 text-left">Temp password</th>
                    </tr></thead>
                    <tbody>
                      {result.created.map((c) => (
                        <tr key={c.id} className="border-t border-slate-100 dark:border-zinc-800">
                          <td className="px-2 py-1.5">{c.email}</td>
                          <td className="px-2 py-1.5">{c.role}</td>
                          <td className="px-2 py-1.5 font-mono">{c.temp_password || <span className="text-slate-400 dark:text-zinc-500">(user-supplied)</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Button variant="outline" size="sm" className="mt-2" onClick={downloadCreatedCsv} data-testid="bulk-download-result-btn">
                  <DownloadSimpleIcon size={14} className="mr-1" /> Download created users CSV
                </Button>
              </details>
            )}
            {(result.skipped.length > 0 || result.errors.length > 0) && (
              <details className="text-sm">
                <summary className="cursor-pointer font-medium text-slate-700 dark:text-zinc-200 py-1">Issues ({result.skipped.length + result.errors.length})</summary>
                <ul className="mt-2 space-y-1 text-xs">
                  {result.skipped.map((s, i) => (
                    <li key={`s${i}`} className="text-amber-700">Row {s.row} ({s.email}): {s.reason}</li>
                  ))}
                  {result.errors.map((e, i) => (
                    <li key={`e${i}`} className="text-red-700">Row {e.row} ({e.email}): {e.error}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => handleClose(false)} data-testid="bulk-close-btn">
            {result ? "Close" : "Cancel"}
          </Button>
          {!result && (
            <Button type="button" onClick={submit} disabled={!parsed || loading} data-testid="bulk-submit-btn">
              {loading ? "Importing..." : `Import ${parsed?.data?.length || 0} people`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
