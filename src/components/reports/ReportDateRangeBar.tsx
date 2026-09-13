"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";

interface Option {
  id: string;
  name: string;
}

/** From/To filter bar for a period report (P&L, Cash Flow Statement, the Sales reports).
 * Pushes the chosen range onto the URL as ?from=&to= — the report page itself is a server
 * component that reads those (falling back to defaultFiscalYearRange when absent), so this
 * component owns no report data itself, just the navigation.
 *
 * Optional Project/Unit dropdowns: pass `projects`/`units` (from loadProjectUnitOptions) to
 * render them and have their selection pushed onto the URL as ?projectId=&unitId= too. A
 * report that doesn't support this filter simply omits the two props — nothing renders and
 * the URL shape is unchanged, so this stays a drop-in replacement for every existing caller.
 *
 * Optional Vendor/Customer dropdown: pass `vendors` (from loadVendorOptions) on the Payments
 * Made report, or `customers` (from loadCustomerOptions) on Payments Received, to render a
 * third dropdown and have its selection pushed onto the URL as ?vendorId=/?customerId=. Only
 * one of the two is ever meaningful on a given report, but both are accepted independently so
 * a page only needs to pass the one it actually supports. */
export default function ReportDateRangeBar({
  from,
  to,
  projectId,
  unitId,
  projects,
  units,
  vendorId,
  vendors,
  customerId,
  customers,
}: {
  from: string;
  to: string;
  projectId?: string | null;
  unitId?: string | null;
  projects?: Option[];
  units?: Option[];
  vendorId?: string | null;
  vendors?: Option[];
  customerId?: string | null;
  customers?: Option[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const [proj, setProj] = useState(projectId ?? "");
  const [unit, setUnit] = useState(unitId ?? "");
  const [vendor, setVendor] = useState(vendorId ?? "");
  const [customer, setCustomer] = useState(customerId ?? "");

  function apply() {
    const params = new URLSearchParams({ from: f, to: t });
    if (proj) params.set("projectId", proj);
    if (unit) params.set("unitId", unit);
    if (vendor) params.set("vendorId", vendor);
    if (customer) params.set("customerId", customer);
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
      {vendors && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Vendor</label>
          <select className="input" value={vendor} onChange={(e) => setVendor(e.target.value)}>
            <option value="">All Vendors</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {customers && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Customer</label>
          <select className="input" value={customer} onChange={(e) => setCustomer(e.target.value)}>
            <option value="">All Customers</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
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
