"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Info } from "lucide-react";
import { accountCategory } from "@/lib/accounts";

type Category = "asset" | "liability" | "equity";

const CATEGORY_LABEL: Record<Category, string> = { asset: "Asset", liability: "Liability", equity: "Equity" };
const CATEGORY_ORDER: Category[] = ["asset", "liability", "equity"];

interface JournalLine {
  account_id: string;
  code: string | null;
  name: string;
  type: string;
  debit: string | number;
  credit: string | number;
  description: string;
}

interface EditableAccount {
  id: string;
  code: string | null;
  name: string;
  type: string;
  category: Category;
  debit: number;
  credit: number;
}

interface SpecialAccount {
  id: string;
  code: string | null;
  name: string;
}

function toDateInput(v: string | Date | null) {
  if (!v) return "";
  // Same Date-vs-string handling used throughout this app's settings forms — pg (and the RSC
  // serialization boundary) can hand this back as a real Date object despite the column being
  // DATE, so read the UTC calendar fields directly rather than round-tripping through
  // toString()/slice().
  if (v instanceof Date) {
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, "0");
    const d = String(v.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
}

function formatDisplayDate(v: string | Date | null) {
  const iso = toDateInput(v);
  if (!iso) return "Not set";
  const d = new Date(`${iso}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}

/** Plain numeric formatting for the Debit/Credit table columns — no currency symbol, matching
 * the reference screenshot's own bare "1,000.00" / "0" columns (the currency is only named
 * once, in the column header). */
function fmt(n: number) {
  if (n === 0) return "0";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function OpeningBalancesManager({
  currency,
  migrationDate,
  journalLines,
  editableAccounts,
  arAccount,
  apAccount,
  customerOpeningTotal,
  vendorOpeningTotal,
  canManage,
}: {
  currency: string;
  migrationDate: string | Date | null;
  journalLines: JournalLine[];
  editableAccounts: EditableAccount[];
  arAccount: SpecialAccount | null;
  apAccount: SpecialAccount | null;
  customerOpeningTotal: number;
  vendorOpeningTotal: number;
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [migrationDateInput, setMigrationDateInput] = useState(toDateInput(migrationDate));
  const [rows, setRows] = useState<Record<string, { debit: number; credit: number }>>(() =>
    Object.fromEntries(editableAccounts.map((a) => [a.id, { debit: a.debit, credit: a.credit }]))
  );

  const hasData = Boolean(migrationDate) || journalLines.length > 0;

  const groupedLines = useMemo(() => {
    const groups: Record<Category, JournalLine[]> = { asset: [], liability: [], equity: [] };
    for (const line of journalLines) {
      const cat = accountCategory(line.type);
      if (cat === "asset" || cat === "liability" || cat === "equity") groups[cat].push(line);
    }
    return groups;
  }, [journalLines]);

  const readTotals = useMemo(
    () =>
      journalLines.reduce(
        (acc, l) => ({ debit: acc.debit + Number(l.debit), credit: acc.credit + Number(l.credit) }),
        { debit: 0, credit: 0 }
      ),
    [journalLines]
  );

  const groupedEditable = useMemo(() => {
    const groups: Record<Category, EditableAccount[]> = { asset: [], liability: [], equity: [] };
    for (const a of editableAccounts) groups[a.category].push(a);
    return groups;
  }, [editableAccounts]);

  const editTotals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    for (const a of editableAccounts) {
      debit += rows[a.id]?.debit ?? 0;
      credit += rows[a.id]?.credit ?? 0;
    }
    if (customerOpeningTotal > 0) debit += customerOpeningTotal;
    else credit += -customerOpeningTotal;
    if (vendorOpeningTotal > 0) credit += vendorOpeningTotal;
    else debit += -vendorOpeningTotal;
    return { debit: Math.round(debit * 100) / 100, credit: Math.round(credit * 100) / 100 };
  }, [rows, editableAccounts, customerOpeningTotal, vendorOpeningTotal]);

  const diff = Math.round((editTotals.debit - editTotals.credit) * 100) / 100;

  function updateRow(id: string, patch: Partial<{ debit: number; credit: number }>) {
    setRows((prev) => {
      const current = prev[id] ?? { debit: 0, credit: 0 };
      return { ...prev, [id]: { ...current, ...patch } };
    });
  }

  async function onSave() {
    setError(null);
    if (!migrationDateInput) {
      setError("Migration Date is required.");
      return;
    }
    setSaving(true);
    const accounts = editableAccounts
      .map((a) => ({ account_id: a.id, ...rows[a.id] }))
      .filter((a) => (a.debit ?? 0) > 0 || (a.credit ?? 0) > 0);
    const res = await fetch("/api/settings/opening-balances", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ migration_date: migrationDateInput, accounts }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Could not save opening balances.");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  async function onDelete() {
    if (!window.confirm("Delete all opening balances? This removes the Migration Date, every entered account balance, and the Opening Balance journal entry. This can't be undone.")) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/settings/opening-balances", { method: "DELETE" });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Could not delete opening balances.");
      return;
    }
    router.refresh();
  }

  function onCancelEdit() {
    setEditing(false);
    setError(null);
    setMigrationDateInput(toDateInput(migrationDate));
    setRows(Object.fromEntries(editableAccounts.map((a) => [a.id, { debit: a.debit, credit: a.credit }])));
  }

  if (!canManage && !hasData) {
    return (
      <div className="card flex flex-col items-center justify-center gap-2 py-16 text-center text-sm text-gray-500">
        <p>No opening balances have been recorded yet.</p>
      </div>
    );
  }

  if (!editing && !hasData) {
    return (
      <div className="card flex flex-col items-center justify-center gap-4 py-16 text-center">
        <p className="max-w-sm text-sm text-gray-500">
          Record the account balances you were carrying as of the day you switched to NeoAccounting, so your
          books start accurate from day one.
        </p>
        {canManage && (
          <button className="btn-primary" onClick={() => setEditing(true)}>
            Enter Opening Balances
          </button>
        )}
      </div>
    );
  }

  if (editing) {
    return (
      <div className="max-w-4xl space-y-6">
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="card space-y-4 p-6">
          <div>
            <label className="label">Migration Date *</label>
            <input
              type="date"
              className="input max-w-xs"
              value={migrationDateInput}
              onChange={(e) => setMigrationDateInput(e.target.value)}
            />
            <p className="mt-1 text-xs text-gray-400">
              The date you switched to NeoAccounting — the Opening Balance journal entry is dated here.
            </p>
          </div>
        </div>

        <div className="card overflow-hidden p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-2.5">Accounts</th>
                <th className="w-40 px-5 py-2.5 text-right">Debit ({currency})</th>
                <th className="w-40 px-5 py-2.5 text-right">Credit ({currency})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {CATEGORY_ORDER.map((cat) => {
                const accounts = groupedEditable[cat];
                const showAr = cat === "asset" && arAccount;
                const showAp = cat === "liability" && apAccount;
                if (accounts.length === 0 && !showAr && !showAp) return null;
                return (
                  <Fragment key={cat}>
                    <tr className="bg-gray-50/60">
                      <td colSpan={3} className="px-5 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        {CATEGORY_LABEL[cat]}
                      </td>
                    </tr>
                    {showAr && arAccount && (
                      <tr key="ar-row">
                        <td className="px-5 py-2.5">
                          <p className="font-medium text-ink-700">Accounts Receivable</p>
                          <p className="text-xs text-gray-400">
                            Set per customer on their own Opening Balance field —{" "}
                            <Link href="/customers" className="text-brand-600 hover:underline">
                              go to Customers
                            </Link>
                            .
                          </p>
                        </td>
                        <td className="px-5 py-2.5 text-right text-ink-700">
                          {customerOpeningTotal > 0 ? fmt(customerOpeningTotal) : "0"}
                        </td>
                        <td className="px-5 py-2.5 text-right text-ink-700">
                          {customerOpeningTotal < 0 ? fmt(-customerOpeningTotal) : "0"}
                        </td>
                      </tr>
                    )}
                    {showAp && apAccount && (
                      <tr key="ap-row">
                        <td className="px-5 py-2.5">
                          <p className="font-medium text-ink-700">Accounts Payable</p>
                          <p className="text-xs text-gray-400">
                            Set per vendor on their own Opening Balance field —{" "}
                            <Link href="/vendors" className="text-brand-600 hover:underline">
                              go to Vendors
                            </Link>
                            .
                          </p>
                        </td>
                        <td className="px-5 py-2.5 text-right text-ink-700">
                          {vendorOpeningTotal < 0 ? fmt(-vendorOpeningTotal) : "0"}
                        </td>
                        <td className="px-5 py-2.5 text-right text-ink-700">
                          {vendorOpeningTotal > 0 ? fmt(vendorOpeningTotal) : "0"}
                        </td>
                      </tr>
                    )}
                    {accounts.map((a) => (
                      <tr key={a.id}>
                        <td className="px-5 py-2 text-ink-700">{a.code ? `${a.code} - ${a.name}` : a.name}</td>
                        <td className="px-5 py-2">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            className="input text-right"
                            value={rows[a.id]?.debit || ""}
                            onChange={(e) => updateRow(a.id, { debit: parseFloat(e.target.value) || 0, credit: 0 })}
                          />
                        </td>
                        <td className="px-5 py-2">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            className="input text-right"
                            value={rows[a.id]?.credit || ""}
                            onChange={(e) => updateRow(a.id, { credit: parseFloat(e.target.value) || 0, debit: 0 })}
                          />
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50 font-semibold text-ink-800">
                <td className="px-5 py-3">Total</td>
                <td className="px-5 py-3 text-right">{fmt(editTotals.debit)}</td>
                <td className="px-5 py-3 text-right">{fmt(editTotals.credit)}</td>
              </tr>
            </tfoot>
          </table>
          <div className="flex items-start gap-2 border-t border-gray-100 bg-blue-50/60 px-5 py-3 text-xs text-blue-700">
            <Info size={14} className="mt-0.5 shrink-0" />
            <p>
              {diff === 0
                ? "This entry already balances — nothing will post to Opening Balance Adjustments."
                : `The ${fmt(Math.abs(diff))} difference will post automatically to "Opening Balance Adjustments" so this entry balances — you don't need to balance it by hand.`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={onSave} disabled={saving} className="btn-primary">
            {saving ? "Saving..." : "Save"}
          </button>
          <button onClick={onCancelEdit} disabled={saving} className="btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-4">
      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Migration Date: <span className="font-medium text-ink-700">{formatDisplayDate(migrationDate)}</span>
        </p>
        {canManage && (
          <div className="flex items-center gap-2">
            <button className="btn-secondary" onClick={() => setEditing(true)}>
              <Pencil size={14} /> Edit
            </button>
            <button
              onClick={onDelete}
              disabled={saving}
              title="Delete"
              className="rounded-md p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <Info size={16} className="mt-0.5 shrink-0 text-amber-500" />
        <p>
          <span className="font-semibold text-red-600">Tax Update:</span> The opening balances for your customers
          and vendors will not be included in your VAT Return if your Migration Date is on or after your first VAT
          return generation date. If you want the opening balances to be included in your VAT return, record it by
          creating an invoice for customer opening balance or bill for vendor opening balance after your VAT return
          generation date.
        </p>
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-5 py-2.5">Accounts</th>
              <th className="px-5 py-2.5 text-right">Debit ({currency})</th>
              <th className="px-5 py-2.5 text-right">Credit ({currency})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {CATEGORY_ORDER.map((cat) => {
              const lines = groupedLines[cat];
              if (lines.length === 0) return null;
              return (
                <Fragment key={cat}>
                  <tr className="bg-gray-50/60">
                    <td colSpan={3} className="px-5 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {CATEGORY_LABEL[cat]}
                    </td>
                  </tr>
                  {lines.map((l, i) => {
                    const isAdjustment = l.description === "Opening Balance Adjustments";
                    return (
                      <tr key={`${cat}-${i}`}>
                        <td className="px-5 py-2.5">
                          {isAdjustment ? (
                            <span className="text-ink-700">{l.name}</span>
                          ) : (
                            <Link href={`/chart-of-accounts/${l.account_id}`} className="text-brand-600 hover:underline">
                              {l.name}
                            </Link>
                          )}
                        </td>
                        <td className="px-5 py-2.5 text-right text-ink-700">{fmt(Number(l.debit))}</td>
                        <td className="px-5 py-2.5 text-right text-ink-700">{fmt(Number(l.credit))}</td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200 bg-gray-50 font-semibold text-ink-800">
              <td className="px-5 py-3">Total :</td>
              <td className="px-5 py-3 text-right">{fmt(readTotals.debit)}</td>
              <td className="px-5 py-3 text-right">{fmt(readTotals.credit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
