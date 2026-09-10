"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";

/** From/To filter bar for a period report (P&L, Cash Flow Statement, the Sales reports).
 * Pushes the chosen range onto the URL as ?from=&to= — the report page itself is a server
 * component that reads those (falling back to defaultFiscalYearRange when absent), so this
 * component owns no report data itself, just the navigation. */
export default function ReportDateRangeBar({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);

  function apply() {
    const params = new URLSearchParams({ from: f, to: t });
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-gray-200 bg-white px-6 py-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">From</label>
        <input type="date" className="input" value={f} onChange={(e) => setF(e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">To</label>
        <input type="date" className="input" value={t} onChange={(e) => setT(e.target.value)} />
      </div>
      <button type="button" onClick={apply} className="btn-primary">
        Run Report
      </button>
    </div>
  );
}
