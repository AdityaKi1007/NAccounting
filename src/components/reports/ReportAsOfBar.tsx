"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";

interface Option {
  id: string;
  name: string;
}

/** Single "As of Date" filter bar for a point-in-time report (Balance Sheet, AR Aging
 * Summary). Same URL-driven pattern as ReportDateRangeBar, including the same optional
 * Project/Unit dropdowns (see that component's own comment) — omit `projects`/`units` for a
 * report that doesn't support the filter. */
export default function ReportAsOfBar({
  asOf,
  projectId,
  unitId,
  projects,
  units,
}: {
  asOf: string;
  projectId?: string | null;
  unitId?: string | null;
  projects?: Option[];
  units?: Option[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [d, setD] = useState(asOf);
  const [proj, setProj] = useState(projectId ?? "");
  const [unit, setUnit] = useState(unitId ?? "");

  function apply() {
    const params = new URLSearchParams({ asOf: d });
    if (proj) params.set("projectId", proj);
    if (unit) params.set("unitId", unit);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-gray-200 bg-white px-6 py-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">As of Date</label>
        <input type="date" className="input" value={d} onChange={(e) => setD(e.target.value)} />
      </div>
      {projects && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Project</label>
          <select className="input" value={proj} onChange={(e) => setProj(e.target.value)}>
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {units && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Unit</label>
          <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="">All Units</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <button type="button" onClick={apply} className="btn-primary">
        Run Report
      </button>
    </div>
  );
}
