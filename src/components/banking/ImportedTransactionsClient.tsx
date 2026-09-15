"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownCircle, ArrowUpCircle, Check, Loader2, X, Trash2 } from "lucide-react";
import { formatDate, formatCurrency } from "@/lib/format";

export interface ImportedTxnRow {
  id: string;
  bank_account_id: string;
  bank_account_name: string;
  txn_date: string;
  description: string;
  reference: string | null;
  amount: string;
  direction: "in" | "out";
  status: "pending" | "posted" | "ignored";
  category_account_id: string | null;
  journal_id: string | null;
  created_at: string;
}

export interface BankAccountOption {
  id: string;
  account_name: string;
}

export interface CategoryOption {
  id: string;
  name: string;
  type: string;
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  posted: "bg-emerald-50 text-emerald-700",
  ignored: "bg-gray-100 text-gray-500",
};

export default function ImportedTransactionsClient({
  rows,
  bankAccountOptions,
  categoryOptions,
}: {
  rows: ImportedTxnRow[];
  bankAccountOptions: BankAccountOption[];
  categoryOptions: CategoryOption[];
}) {
  const router = useRouter();
  const [bankFilter, setBankFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"pending" | "posted" | "ignored" | "all">("pending");
  const [categoryChoice, setCategoryChoice] = useState<Record<string, string>>({});
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkPosting, setBulkPosting] = useState(false);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (bankFilter && r.bank_account_id !== bankFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      return true;
    });
  }, [rows, bankFilter, statusFilter]);

  function setBusy(id: string, busy: boolean) {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function postOne(id: string, categoryAccountId: string) {
    if (!categoryAccountId) return setError("Choose a category first.");
    setBusy(id, true);
    setError(null);
    try {
      const res = await fetch(`/api/banking/statement-imports/${id}/post`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category_account_id: categoryAccountId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not post this transaction.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(id, false);
    }
  }

  async function ignoreOne(id: string) {
    setBusy(id, true);
    setError(null);
    try {
      const res = await fetch(`/api/banking/statement-imports/${id}/ignore`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not ignore this transaction.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(id, false);
    }
  }

  async function deleteOne(id: string) {
    setBusy(id, true);
    setError(null);
    try {
      const res = await fetch(`/api/banking/statement-imports/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not delete this transaction.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(id, false);
    }
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function postSelected() {
    if (!bulkCategory) return setError("Choose a category for the selected transactions first.");
    const ids = Array.from(selected).filter((id) => filtered.find((r) => r.id === id)?.status === "pending");
    if (ids.length === 0) return setError("Select at least one pending transaction.");
    setBulkPosting(true);
    setError(null);
    try {
      for (const id of ids) {
        const res = await fetch(`/api/banking/statement-imports/${id}/post`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category_account_id: bulkCategory }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(typeof data.error === "string" ? data.error : `Could not post one of the selected transactions (stopped after ${ids.indexOf(id)} of ${ids.length}).`);
          break;
        }
      }
      setSelected(new Set());
      router.refresh();
    } finally {
      setBulkPosting(false);
    }
  }

  const pendingSelectedCount = Array.from(selected).filter((id) => filtered.find((r) => r.id === id)?.status === "pending").length;

  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-ink-800">Imported Transactions</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Staged rows from a bank statement import. Pick a category and post to create the matching journal entry — nothing here
          affects your books until then.
        </p>
      </div>

      <div className="p-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <select value={bankFilter} onChange={(e) => setBankFilter(e.target.value)} className="input w-56">
            <option value="">All accounts</option>
            {bankAccountOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.account_name}
              </option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="input w-40">
            <option value="pending">Pending</option>
            <option value="posted">Posted</option>
            <option value="ignored">Ignored</option>
            <option value="all">All</option>
          </select>

          {statusFilter === "pending" && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-gray-500">{pendingSelectedCount} selected</span>
              <select value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} className="input w-56">
                <option value="">Category for selected…</option>
                {categoryOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={postSelected}
                disabled={bulkPosting || pendingSelectedCount === 0}
                className="btn-primary py-1.5 text-xs"
              >
                {bulkPosting ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                Post Selected
              </button>
            </div>
          )}
        </div>

        {error && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="card overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">No transactions here yet.</div>
          ) : (
            <table className="w-full table-fixed text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  {statusFilter === "pending" && <th className="w-8 px-3 py-2.5" />}
                  <th className="w-24 px-3 py-2.5">Date</th>
                  <th className="w-40 px-3 py-2.5">Account</th>
                  <th className="px-3 py-2.5">Description</th>
                  <th className="w-28 px-3 py-2.5">Amount</th>
                  <th className="w-56 px-3 py-2.5">Category / Action</th>
                  <th className="w-24 px-3 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((row) => {
                  const busy = busyIds.has(row.id);
                  return (
                    <tr key={row.id}>
                      {statusFilter === "pending" && (
                        <td className="px-3 py-2.5">
                          <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelected(row.id)} />
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-ink-700">{formatDate(row.txn_date)}</td>
                      <td className="truncate px-3 py-2.5 text-ink-700">{row.bank_account_name}</td>
                      <td className="truncate px-3 py-2.5 text-ink-700">
                        {row.description}
                        {row.reference && <span className="ml-1 text-xs text-gray-400">({row.reference})</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`flex items-center gap-1 font-medium ${row.direction === "in" ? "text-emerald-600" : "text-red-600"}`}>
                          {row.direction === "in" ? <ArrowDownCircle size={13} /> : <ArrowUpCircle size={13} />}
                          {formatCurrency(row.amount)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {row.status === "pending" ? (
                          <div className="flex items-center gap-1.5">
                            <select
                              value={categoryChoice[row.id] ?? ""}
                              onChange={(e) => setCategoryChoice((prev) => ({ ...prev, [row.id]: e.target.value }))}
                              className="input py-1 text-xs"
                            >
                              <option value="">Category…</option>
                              {categoryOptions.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => postOne(row.id, categoryChoice[row.id] ?? "")}
                              disabled={busy}
                              title="Post"
                              className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                            >
                              {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                            </button>
                            <button
                              type="button"
                              onClick={() => ignoreOne(row.id)}
                              disabled={busy}
                              title="Ignore"
                              className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 disabled:opacity-50"
                            >
                              <X size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteOne(row.id)}
                              disabled={busy}
                              title="Delete"
                              className="rounded-md p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-50"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ) : row.status === "posted" && row.journal_id ? (
                          <a href={`/manual-journals/${row.journal_id}`} className="text-xs text-brand-600 hover:underline">
                            View Journal Entry
                          </a>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`rounded px-1.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[row.status]}`}>{row.status}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
