"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";

/** Single "As of Date" filter bar for a point-in-time report (Balance Sheet, AR Aging
 * Summary). Same URL-driven pattern as ReportDateRangeBar. */
export default function ReportAsOfBar({ asOf }: { asOf: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [d, setD] = useState(asOf);

  function apply() {
    const params = new URLSearchParams({ asOf: d });
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-gray-200 bg-white px-6 py-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">As of Date</label>
        <input type="date" className="input" value={d} onChange={(e) => setD(e.target.value)} />
      </div>
      <button type="button" onClick={apply} className="btn-primary">
        Run Report
      </button>
    </div>
  );
}
