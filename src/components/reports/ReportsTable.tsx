"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Star } from "lucide-react";

export interface ReportRow {
  label: string;
  href: string;
  category: string;
  placeholder?: boolean;
}

/** Client-side search box + flat table (Name / Category / Type / Last Viewed), matching the
 * reference screenshot's layout. "Type" is always "System Generated" (every report here is
 * computed live from transaction data, not a saved custom report) and "Last Viewed" is always
 * "-" — this app doesn't track per-report view history, so showing anything else here would be
 * fabricated. The star icon is decorative only (no favoriting/persistence exists), same as
 * before this page was rebuilt. */
export default function ReportsTable({ rows }: { rows: ReportRow[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) => r.label.toLowerCase().includes(needle) || r.category.toLowerCase().includes(needle)
    );
  }, [rows, q]);

  return (
    <div>
      <div className="mb-4 max-w-sm">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search reports"
            className="input pl-9"
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-5 py-2.5">Report Name</th>
              <th className="px-5 py-2.5">Category</th>
              <th className="px-5 py-2.5">Type</th>
              <th className="px-5 py-2.5">Last Viewed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td className="px-5 py-10 text-center text-gray-400" colSpan={4}>
                  No reports match &quot;{q}&quot;.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                // href alone isn't unique — the same placeholder report (Refund History) is
                // deliberately listed under two categories, matching the reference
                // screenshot's convention of showing it under both Payments Received and
                // Payables. Without category in the key, React reconciles the two rows as
                // "the same" element across renders (e.g. when the search filter changes
                // which rows are visible), which was confirmed live to make the wrong row's
                // content appear after typing into the search box.
                <tr key={`${r.href}-${r.category}`}>
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Star size={15} className="shrink-0 text-gray-300" />
                      <Link
                        href={r.href}
                        className={
                          r.placeholder
                            ? "font-medium text-gray-500 hover:underline"
                            : "font-medium text-brand-600 hover:underline"
                        }
                      >
                        {r.label}
                      </Link>
                    </div>
                  </td>
                  <td className="px-5 py-2.5 text-ink-700">{r.category}</td>
                  <td className="px-5 py-2.5 text-ink-700">System Generated</td>
                  <td className="px-5 py-2.5 text-ink-700">-</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
