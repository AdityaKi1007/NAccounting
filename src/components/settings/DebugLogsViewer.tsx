"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, ChevronLeft, Bug, Trash2 } from "lucide-react";
import { formatDateTime } from "@/lib/format";

interface DebugLogRow {
  id: string;
  source: "server" | "client";
  level: string;
  message: string;
  stack: string | null;
  context: Record<string, unknown> | null;
  created_at: string;
}

const PAGE_SIZE = 25;

const SOURCE_STYLES: Record<string, string> = {
  server: "bg-amber-100 text-amber-700",
  client: "bg-blue-100 text-blue-700",
};

/** Settings -> Debug Logs (its own top-level group next to Usages — see settings.ts). Owner,
 * Admin and Super Admin only, enforced both by the settings page (which only renders this
 * component when canManageDebugLogs is true — same "page hides, API still enforces
 * independently" pattern as Audit Logs/Access Matrix) and by every /api/settings/debug-logs*
 * route on its own. Mirrors AuditLogViewer.tsx's own pagination/expand-row shape, plus the two
 * things Audit Logs deliberately doesn't have: an Enable toggle (nothing is captured until an
 * admin turns this on — see debug-logs.ts's isDebugLogsEnabled) and delete actions (an audit
 * trail is meant to be permanent; a debug log is just a bug report, meant to be cleared out). */
export default function DebugLogsViewer({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const [sourceFilter, setSourceFilter] = useState("");
  const [offset, setOffset] = useState(0);

  const [rows, setRows] = useState<DebugLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (sourceFilter) params.set("source", sourceFilter);
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(offset));

    fetch(`/api/settings/debug-logs?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(typeof data.error === "string" ? data.error : "Could not load debug logs.");
        }
        return res.json();
      })
      .then((data) => {
        setRows(data.data ?? []);
        setTotal(data.total ?? 0);
      })
      .catch((err) => setError(err.message || "Could not load debug logs."))
      .finally(() => setLoading(false));
  }, [sourceFilter, offset]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleEnabled() {
    const next = !enabled;
    setToggling(true);
    setToggleError(null);
    try {
      const res = await fetch("/api/settings/debug-logs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ debug_logs_enabled: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Could not update this setting.");
      }
      setEnabled(next);
    } catch (e) {
      setToggleError(e instanceof Error ? e.message : "Could not update this setting.");
    } finally {
      setToggling(false);
    }
  }

  async function deleteOne(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/settings/debug-logs/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Could not delete this log entry.");
      }
      if (expandedId === id) setExpandedId(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete this log entry.");
    } finally {
      setDeletingId(null);
    }
  }

  async function clearAll() {
    setClearing(true);
    try {
      const res = await fetch("/api/settings/debug-logs", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Could not clear logs.");
      }
      setConfirmClear(false);
      setOffset(0);
      setExpandedId(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not clear logs.");
    } finally {
      setClearing(false);
    }
  }

  function resetToFirstPage() {
    setOffset(0);
  }

  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + PAGE_SIZE, total);

  return (
    <div>
      <div className="mb-4 border-b border-gray-200 pb-4">
        <h1 className="text-lg font-semibold text-ink-800">Debug Logs</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Captured server and browser exceptions — a bug report trail, not an audit trail. Visible to Owner,
          Admin and Super Admin only.
        </p>
      </div>

      <div className="card mb-4 flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink-800">Enable Debug Logs</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            While off, nothing is captured or stored — turning this on starts recording unhandled exceptions
            from the API and from the browser going forward.
          </p>
          {toggleError && <p className="mt-1 text-xs text-red-600">{toggleError}</p>}
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm text-ink-700">
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            disabled={toggling}
            onClick={toggleEnabled}
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
              enabled ? "bg-brand-600" : "bg-gray-200"
            } ${toggling ? "cursor-not-allowed opacity-60" : ""}`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                enabled ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
          {enabled ? "On" : "Off"}
        </label>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="w-44">
          <select
            className="input"
            value={sourceFilter}
            onChange={(e) => {
              setSourceFilter(e.target.value);
              resetToFirstPage();
            }}
          >
            <option value="">All sources</option>
            <option value="server">Server</option>
            <option value="client">Client (browser)</option>
          </select>
        </div>

        {total > 0 &&
          (confirmClear ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-600">Delete all {total} log entries?</span>
              <button onClick={clearAll} disabled={clearing} className="rounded-md bg-red-600 px-2.5 py-1.5 font-medium text-white hover:bg-red-700">
                {clearing ? "Deleting..." : "Confirm"}
              </button>
              <button onClick={() => setConfirmClear(false)} className="btn-secondary px-2.5 py-1.5 text-xs">
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmClear(true)} className="btn-secondary px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50">
              <Trash2 size={13} /> Clear All
            </button>
          ))}
      </div>

      {error && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="card overflow-x-auto">
        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Bug size={32} className="text-gray-300" />
            <p className="text-sm text-gray-500">
              {enabled ? "No exceptions captured yet." : "Debug Logs is off — turn it on above to start capturing exceptions."}
            </p>
          </div>
        ) : (
          <table className="w-full table-fixed text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="w-8 px-3 py-2.5" />
                <th className="w-44 px-3 py-2.5">Date &amp; Time</th>
                <th className="w-24 px-3 py-2.5">Source</th>
                <th className="px-3 py-2.5">Message</th>
                <th className="w-12 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => {
                const isOpen = expandedId === row.id;
                return (
                  <Fragment key={row.id}>
                    <tr className="cursor-pointer hover:bg-gray-50" onClick={() => setExpandedId(isOpen ? null : row.id)}>
                      <td className="px-3 py-2.5 text-gray-400">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                      <td className="px-3 py-2.5 text-ink-700">{formatDateTime(row.created_at)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`rounded px-1.5 py-0.5 text-xs font-medium capitalize ${SOURCE_STYLES[row.source] ?? "bg-gray-100 text-gray-600"}`}>
                          {row.source}
                        </span>
                      </td>
                      <td className="truncate px-3 py-2.5 text-ink-700">{row.message}</td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteOne(row.id);
                          }}
                          disabled={deletingId === row.id}
                          className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                          title="Delete this log entry"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-gray-50/60">
                        <td colSpan={5} className="p-0">
                          <div className="space-y-3 px-4 py-3">
                            <div>
                              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Message</p>
                              <p className="whitespace-pre-wrap break-all text-xs text-ink-700">{row.message}</p>
                            </div>
                            {row.stack && (
                              <div>
                                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Stack Trace</p>
                                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md bg-ink-900 px-3 py-2 text-[11px] text-gray-100">
                                  {row.stack}
                                </pre>
                              </div>
                            )}
                            {row.context && Object.keys(row.context).length > 0 && (
                              <div>
                                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Context</p>
                                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md bg-gray-100 px-3 py-2 text-[11px] text-ink-700">
                                  {JSON.stringify(row.context, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {total > 0 && (
        <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
          <span>
            {rangeStart}–{rangeEnd} of {total}
          </span>
          <div className="flex items-center gap-2">
            <button className="btn-secondary px-2 py-1" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
              <ChevronLeft size={14} /> Prev
            </button>
            <button className="btn-secondary px-2 py-1" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
