"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Upload, Loader2, CheckCircle2, XCircle, History, ChevronDown, ChevronRight } from "lucide-react";

// The "Import" page: pick an object type, optionally download a blank template for it, then
// upload a filled-in .xlsx to bulk-create records — plus a durable history of past runs
// (per the account owner's explicit "log failed records under logger object" instruction:
// failures are never just shown once and forgotten, they live in import_logs/import_log_rows
// and are always visible here). See src/lib/import/* for the catalog/template/import engine
// and src/app/api/import/* for the routes this component calls.

const OBJECT_TYPES: { key: string; label: string }[] = [
  { key: "invoices", label: "Invoices" },
  { key: "customers", label: "Customers" },
  { key: "receipts", label: "Receipts" },
  { key: "sales-orders", label: "Sales Orders" },
  { key: "vendors", label: "Vendors" },
];

interface ImportRowResult {
  id: string;
  row_number: number;
  status: "success" | "failed";
  error_message: string | null;
  row_data: Record<string, unknown>;
  created_record_id: string | null;
}

interface ImportRunSummary {
  logId: string;
  entity: string;
  fileName: string | null;
  totalRows: number;
  successCount: number;
  failureCount: number;
  rows: ImportRowResult[];
}

interface ImportLogListItem {
  id: string;
  entity: string;
  file_name: string | null;
  total_rows: number;
  success_count: number;
  failure_count: number;
  created_at: string;
}

function labelFor(entity: string): string {
  return OBJECT_TYPES.find((o) => o.key === entity)?.label ?? entity;
}

export default function ImportManager() {
  const [entity, setEntity] = useState("invoices");
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportRunSummary | null>(null);
  const [history, setHistory] = useState<ImportLogListItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<ImportRowResult[] | null>(null);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadHistory = useCallback(() => {
    setHistoryLoading(true);
    fetch("/api/import/logs")
      .then((r) => r.json())
      .then((data) => setHistory(data.rows ?? []))
      .finally(() => setHistoryLoading(false));
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  async function downloadTemplate() {
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch(`/api/import/template?entity=${encodeURIComponent(entity)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : "Could not download the template.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${entity}-import-template.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/import/${encodeURIComponent(entity)}`, { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Import failed.");
        return;
      }
      setResult(data as ImportRunSummary);
      loadHistory();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function toggleHistoryRow(logId: string) {
    if (expandedLogId === logId) {
      setExpandedLogId(null);
      setExpandedRows(null);
      return;
    }
    setExpandedLogId(logId);
    setExpandedRows(null);
    setExpandedLoading(true);
    try {
      const res = await fetch(`/api/import/logs/${logId}`);
      const data = await res.json().catch(() => ({}));
      setExpandedRows(data.rows ?? []);
    } finally {
      setExpandedLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="card p-4">
        <p className="mb-3 text-sm font-semibold text-ink-800">Bulk Import</p>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Object Type</label>
            <select
              value={entity}
              onChange={(e) => {
                setEntity(e.target.value);
                setResult(null);
                setError(null);
              }}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            >
              {OBJECT_TYPES.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <button type="button" onClick={downloadTemplate} disabled={downloading} className="btn-secondary">
            {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Download Template
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="btn-primary"
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {uploading ? "Importing..." : "Upload & Import"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            onChange={handleFileChosen}
            className="hidden"
          />
        </div>

        <p className="mt-2 text-xs text-gray-500">
          Download the template for {labelFor(entity)}, fill in one row per record (Invoices and Sales Orders take
          one line item per row), then upload it here. Project/Unit/Customer/Bank Account columns are matched by
          exact name — a name that doesn&apos;t match anything in your organization fails just that row, and the
          reason is recorded below so you can fix and re-upload it.
        </p>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        {result && (
          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium text-ink-800">
              Imported {result.totalRows} row{result.totalRows === 1 ? "" : "s"} from {labelFor(result.entity)}
              {result.fileName ? ` (${result.fileName})` : ""}
            </p>
            <div className="mb-3 flex gap-4 text-xs">
              <span className="flex items-center gap-1 font-medium text-emerald-600">
                <CheckCircle2 size={13} /> {result.successCount} succeeded
              </span>
              <span className="flex items-center gap-1 font-medium text-red-600">
                <XCircle size={13} /> {result.failureCount} failed
              </span>
            </div>
            {result.failureCount > 0 && (
              <div className="max-h-64 overflow-y-auto rounded border border-gray-200 bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-100 text-gray-500">
                    <tr>
                      <th className="px-2 py-1.5">Row</th>
                      <th className="px-2 py-1.5">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows
                      .filter((r) => r.status === "failed")
                      .map((r) => (
                        <tr key={r.id ?? r.row_number} className="border-t border-gray-100">
                          <td className="px-2 py-1.5 align-top text-gray-600">{r.row_number}</td>
                          <td className="px-2 py-1.5 align-top text-red-600">{r.error_message}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card p-4">
        <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink-800">
          <History size={14} className="text-gray-400" /> Import History
        </p>
        {historyLoading ? (
          <p className="flex items-center gap-2 text-xs text-gray-500">
            <Loader2 size={13} className="animate-spin" /> Loading...
          </p>
        ) : history.length === 0 ? (
          <p className="text-xs text-gray-500">No imports yet.</p>
        ) : (
          <div className="space-y-1">
            {history.map((log) => (
              <div key={log.id} className="rounded-md border border-gray-100">
                <button
                  type="button"
                  onClick={() => toggleHistoryRow(log.id)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-gray-50"
                >
                  <span className="flex items-center gap-2">
                    {expandedLogId === log.id ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    <span className="font-medium text-ink-700">{labelFor(log.entity)}</span>
                    {log.file_name && <span className="text-gray-400">{log.file_name}</span>}
                    <span className="text-gray-400">{new Date(log.created_at).toLocaleString()}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="font-medium text-emerald-600">{log.success_count} ok</span>
                    <span className="font-medium text-red-600">{log.failure_count} failed</span>
                  </span>
                </button>
                {expandedLogId === log.id && (
                  <div className="border-t border-gray-100 p-2">
                    {expandedLoading ? (
                      <p className="flex items-center gap-2 p-2 text-xs text-gray-500">
                        <Loader2 size={12} className="animate-spin" /> Loading rows...
                      </p>
                    ) : (
                      <table className="w-full text-left text-xs">
                        <thead className="text-gray-500">
                          <tr>
                            <th className="px-2 py-1">Row</th>
                            <th className="px-2 py-1">Status</th>
                            <th className="px-2 py-1">Detail</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(expandedRows ?? []).map((r) => (
                            <tr key={r.id} className="border-t border-gray-50">
                              <td className="px-2 py-1 align-top text-gray-600">{r.row_number}</td>
                              <td className="px-2 py-1 align-top">
                                {r.status === "success" ? (
                                  <span className="font-medium text-emerald-600">Success</span>
                                ) : (
                                  <span className="font-medium text-red-600">Failed</span>
                                )}
                              </td>
                              <td className="px-2 py-1 align-top text-gray-600">
                                {r.status === "success" ? "Created" : r.error_message}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
