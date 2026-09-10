import Link from "next/link";
import { Star } from "lucide-react";

interface ReportLink {
  label: string;
  href: string;
}

interface ReportGroup {
  label: string;
  reports: ReportLink[];
}

const REPORT_GROUPS: ReportGroup[] = [
  {
    label: "Business Overview",
    reports: [
      { label: "Profit and Loss", href: "/reports/profit-and-loss" },
      { label: "Cash Flow Statement", href: "/reports/cash-flow" },
      { label: "Balance Sheet", href: "/reports/balance-sheet" },
    ],
  },
  {
    label: "Sales",
    reports: [
      { label: "Sales by Customer", href: "/reports/sales-by-customer" },
      { label: "Sales by Item", href: "/reports/sales-by-item" },
      { label: "Sales by Salesperson", href: "/reports/sales-by-salesperson" },
      { label: "Sales Summary", href: "/reports/sales-summary" },
    ],
  },
  {
    label: "Receivables",
    reports: [{ label: "AR Aging Summary", href: "/reports/ar-aging-summary" }],
  },
];

export default function ReportsPage() {
  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-ink-800">Reports</h1>
        <p className="mt-0.5 text-sm text-gray-500">Generated live from your transaction data.</p>
      </div>

      <div className="p-6">
        <div className="space-y-6">
          {REPORT_GROUPS.map((group) => (
            <div key={group.label} className="card overflow-hidden">
              <div className="border-b border-gray-100 bg-gray-50 px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {group.label}
              </div>
              <div className="divide-y divide-gray-100">
                {group.reports.map((report) => (
                  <div key={report.href} className="flex items-center gap-3 px-5 py-3">
                    <Star size={15} className="shrink-0 text-gray-300" />
                    <Link href={report.href} className="text-sm font-medium text-brand-600 hover:underline">
                      {report.label}
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
