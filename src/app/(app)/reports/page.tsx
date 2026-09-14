import ReportsTable, { type ReportRow } from "@/components/reports/ReportsTable";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";

// Flat catalog matching the reference screenshot's layout (Report Name / Category / Type /
// Last Viewed) rather than the previous grouped-card layout. Category order follows the
// screenshot: Business Overview and Sales predate this pass and are kept as-is, then
// Receivables / Payments Received / Payables / Accountant / Activity in the order shown.
const REPORT_ROWS: ReportRow[] = [
  { label: "Profit and Loss", href: "/reports/profit-and-loss", category: "Business Overview" },
  { label: "Cash Flow Statement", href: "/reports/cash-flow", category: "Business Overview" },
  { label: "Balance Sheet", href: "/reports/balance-sheet", category: "Business Overview" },

  { label: "Sales by Customer", href: "/reports/sales-by-customer", category: "Sales" },
  { label: "Sales by Item", href: "/reports/sales-by-item", category: "Sales" },
  { label: "Sales by Salesperson", href: "/reports/sales-by-salesperson", category: "Sales" },
  { label: "Sales Summary", href: "/reports/sales-summary", category: "Sales" },

  { label: "Invoice Details", href: "/reports/invoice-details", category: "Receivables" },
  { label: "Customer Balance Summary", href: "/reports/customer-balance-summary", category: "Receivables" },
  { label: "Receivable Summary", href: "/reports/receivable-summary", category: "Receivables" },
  { label: "AR Aging Summary", href: "/reports/ar-aging-summary", category: "Receivables" },

  { label: "Payments Received", href: "/reports/payments-received", category: "Payments Received" },
  { label: "Refund History", href: "/reports/refund-history", category: "Payments Received", placeholder: true },

  { label: "Payments Made", href: "/reports/payments-made", category: "Payables" },
  { label: "Refund History", href: "/reports/refund-history", category: "Payables", placeholder: true },

  { label: "General Ledger", href: "/reports/general-ledger", category: "Accountant" },
  { label: "Trial Balance", href: "/reports/trial-balance", category: "Accountant" },
  { label: "Deferred Revenue", href: "/reports/deferred-revenue", category: "Accountant" },

  { label: "Activity Logs & Audit Trail", href: "/reports/activity-logs", category: "Activity", placeholder: true },
];

export default async function ReportsPage() {
  const ctx = await requireActiveContext();
  await requireModuleAccess(ctx, "reports", "view");

  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-ink-800">Reports</h1>
        <p className="mt-0.5 text-sm text-gray-500">Generated live from your transaction data.</p>
      </div>

      <div className="p-6">
        <ReportsTable rows={REPORT_ROWS} />
      </div>
    </div>
  );
}
