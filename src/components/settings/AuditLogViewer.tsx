"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import { ChevronDown, ChevronRight, History, ChevronLeft } from "lucide-react";
import { formatDateTime } from "@/lib/format";

// Kept in sync with AUDIT_MODULE_LABELS in src/lib/audit-log.ts (a plain label map, so
// duplicating it here rather than importing keeps this client component from ever pulling in
// audit-log.ts's `pool` import, which is a server-only pg connection). See that file's
// top-of-file comment for exactly which write paths feed each of these modules.
const MODULE_LABELS: Record<string, string> = {
  invoices: "Invoices",
  "payments-received": "Receipts",
  customers: "Customers",
  vendors: "Vendors",
  "credit-notes": "Credit Notes",
  "purchase-orders": "Purchase Orders",
  bills: "Bills",
  "payments-made": "Payments Made",
  "bank-accounts": "Banking",
  projects: "Projects",
  inventory: "Units",
};
const MODULE_ENTRIES = Object.entries(MODULE_LABELS);

const ACTION_STYLES: Record<string, string> = {
  create: "bg-emerald-100 text-emerald-700",
  update: "bg-amber-100 text-amber-700",
  delete: "bg-red-100 text-red-700",
};

interface AuditLogRow {
  id: string;
  action: "create" | "update" | "delete";
  module: string;
  entity_id: string | null;
  entity_label: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_fields: string[] | null;
  created_at: string;
  user_id: string | null;
  api_key_id: string | null;
  user_name: string | null;
  user_email: string | null;
  api_key_name: string | null;
}

interface OrgUser {
  user_id: string;
  name: string;
  email: string;
}

const PAGE_SIZE = 25;

function actorLabel(row: AuditLogRow) {
  if (row.user_id) return row.user_name || row.user_email || "Unknown user";
  if (row.api_key_id) return `API key — ${row.api_key_name ?? "revoked key"}`;
  return "System";
}

function DiffValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-gray-400">—</span>;
  if (typeof value === "object") {
    return <code className="whitespace-pre-wrap break-all">{JSON.stringify(value)}</code>;
  }
  return <code className="whitespace-pre-wrap break-all">{String(value)}</code>;
}

function ExpandedDetail({ row }: { row: AuditLogRow }) {
  const changed = new Set(row.changed_fields ?? []);
  const fields =
    row.action === "update"
      ? Array.from(changed).sort()
      : Array.from(
          new Set([...Object.keys(row.old_data ?? {}), ...Object.keys(row.new_data ?? {})])
        ).sort();

  if (fields.length === 0) {
    return <p className="px-4 py-3 text-xs text-gray-400">No field-level detail recorded for this entry.</p>;
  }

  return (
    <div className="overflow-x-auto px-4 py-3">
      <table className="w-full text-left text-xs">
        <thead className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          <tr>
            <th className="py-1 pr-3">Field</th>
            {row.action !== "create" && <th className="py-1 pr-3">Before</th>}
            {row.action !== "delete" && <th className="py-1 pr-3">After</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {fields.map((f) => (
            <tr key={f}>
              <td className="py-1.5 pr-3 font-medium text-ink-700">{f}</td>
              {row.action !== "create" && (
                <td className="py-1.5 pr-3 text-gray-600">
                  <DiffValue value={row.old_data?.[f]} />
                </td>
              )}
              {row.action !== "delete" && (
                <td className="py-1.5 pr-3 text-gray-600">
                  <DiffValue value={row.new_data?.[f]} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AuditLogViewer({ users }: { users: OrgUser[] }) {
  const [moduleFilter, setModuleFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [offset, setOffset] = useState(0);

  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (moduleFilter) params.set("module", moduleFilter);
    if (actionFilter) params.set("action", actionFilter);
    if (userFilter) params.set("userId", userFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(offset));

    fetch(`/api/settings/audit-logs?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(typeof data.error === "string" ? data.error : "Could not load audit logs.");
        }
        return res.json();
      })
      .then((data) => {
        setRows(data.data ?? []);
        setTotal(data.total ?? 0);
      })
      .catch((err) => setError(err.message || "Could not load audit logs."))
      .finally(() => setLoading(false));
  }, [moduleFilter, actionFilter, userFilter, dateFrom, dateTo, offset]);

  useEffect(() => {
    load();
  }, [load]);

  function resetToFirstPage() {
    setOffset(0);
  }

  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + PAGE_SIZE, total);

  return (
    <div>
      <div className="mb-4 border-b border-gray-200 pb-4">
        <h1 className="text-lg font-semibold text-ink-800">Audit Logs</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Every create, update and delete across Invoices, Receipts, Customers, Vendors, Credit Notes, Purchase
          Orders, Bills, Payments Made, Banking, Projects and Units. Visible to Owner and Admin only.
        </p>
      </div>

      <div className="card mb-4 grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label className="label">Module</label>
          <select
            className="input"
            value={moduleFilter}
            onChange={(e) => {
              setModuleFilter(e.target.value);
              resetToFirstPage();
            }}
          >
            <option value="">All modules</option>
            {MODULE_ENTRIES.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Action</label>
          <select
            className="input"
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              resetToFirstPage();
            }}
          >
            <option value="">All actions</option>
            <option value="create">Create</option>
            <option value="update">Update</option>
            <option value="delete">Delete</option>
          </select>
        </div>
        <div>
          <label className="label">User</label>
          <select
            className="input"
            value={userFilter}
            onChange={(e) => {
              setUserFilter(e.target.value);
              resetToFirstPage();
            }}
          >
            <option value="">All users</option>
            {users.map((u) => (
              <option key={u.user_id} value={u.user_id}>
                {u.name || u.email}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">From</label>
          <input
            type="date"
            className="input"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              resetToFirstPage();
            }}
          />
        </div>
        <div>
          <label className="label">To</label>
          <input
            type="date"
            className="input"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              resetToFirstPage();
            }}
          />
        </div>
      </div>

      {error && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="card overflow-x-auto">
        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <History size={32} className="text-gray-300" />
            <p className="text-sm text-gray-500">No audit log entries match these filters.</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="w-8 px-3 py-2.5" />
                <th className="px-3 py-2.5">Date &amp; Time</th>
                <th className="px-3 py-2.5">Module</th>
                <th className="px-3 py-2.5">Action</th>
                <th className="px-3 py-2.5">Record</th>
                <th className="px-3 py-2.5">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => {
                const isOpen = expandedId === row.id;
                return (
                  <Fragment key={row.id}>
                    <tr
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => setExpandedId(isOpen ? null : row.id)}
                    >
                      <td className="px-3 py-2.5 text-gray-400">
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>
                      <td className="px-3 py-2.5 text-ink-700">{formatDateTime(row.created_at)}</td>
                      <td className="px-3 py-2.5 text-ink-700">{MODULE_LABELS[row.module] ?? row.module}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs font-medium capitalize ${ACTION_STYLES[row.action] ?? "bg-gray-100 text-gray-600"}`}
                        >
                          {row.action}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-ink-700">{row.entity_label || "—"}</td>
                      <td className="px-3 py-2.5 text-gray-600">{actorLabel(row)}</td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-gray-50/60">
                        <td colSpan={6} className="p-0">
                          <ExpandedDetail row={row} />
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
            <button
              className="btn-secondary px-2 py-1"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <button
              className="btn-secondary px-2 py-1"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
