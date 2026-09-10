import { requireActiveContext } from "@/lib/session";
import { query, queryOne } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
import Link from "next/link";
import { Users, FileText, Receipt, ShoppingBag, ArrowUpRight } from "lucide-react";

export default async function HomePage() {
  const ctx = await requireActiveContext();
  const orgId = ctx.orgId;

  const [customerCount, vendorCount, receivable, payable, recentInvoices] = await Promise.all([
    queryOne<{ count: string }>(`SELECT count(*) FROM customers WHERE organization_id = $1`, [orgId]),
    queryOne<{ count: string }>(`SELECT count(*) FROM vendors WHERE organization_id = $1`, [orgId]),
    queryOne<{ total: string | null }>(
      `SELECT sum(balance_due) AS total FROM invoices WHERE organization_id = $1 AND status != 'paid'`,
      [orgId]
    ),
    queryOne<{ total: string | null }>(
      `SELECT sum(balance_due) AS total FROM bills WHERE organization_id = $1 AND status != 'paid'`,
      [orgId]
    ),
    query<{ id: string; invoice_number: string; total: string; status: string; invoice_date: string; customer_name: string | null }>(
      `SELECT i.id, i.invoice_number, i.total, i.status, i.invoice_date, c.display_name AS customer_name
       FROM invoices i
       LEFT JOIN customers c ON c.id = i.customer_id
       WHERE i.organization_id = $1
       ORDER BY i.created_at DESC
       LIMIT 5`,
      [orgId]
    ),
  ]);

  const stats = [
    {
      label: "Customers",
      value: customerCount?.count ?? "0",
      icon: Users,
      href: "/customers",
    },
    {
      label: "Vendors",
      value: vendorCount?.count ?? "0",
      icon: ShoppingBag,
      href: "/vendors",
    },
    {
      label: "Receivables",
      value: formatCurrency(receivable?.total ?? 0, "AED"),
      icon: FileText,
      href: "/invoices",
    },
    {
      label: "Payables",
      value: formatCurrency(payable?.total ?? 0, "AED"),
      icon: Receipt,
      href: "/bills",
    },
  ];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-800">Hello, {ctx.userName.split(" ")[0] || "there"}</h1>
        <p className="mt-1 text-sm text-gray-500">Here&apos;s what&apos;s happening at {ctx.orgName} today.</p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="card p-5 transition hover:shadow-md">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <s.icon size={18} />
              </div>
              <ArrowUpRight size={15} className="text-gray-300" />
            </div>
            <p className="text-2xl font-semibold text-ink-800">{s.value}</p>
            <p className="text-sm text-gray-500">{s.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-800">Recent Invoices</h2>
            <Link href="/invoices" className="text-xs font-medium text-brand-600 hover:underline">
              View all
            </Link>
          </div>
          {recentInvoices.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">No invoices yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="py-2">Invoice #</th>
                  <th className="py-2">Customer</th>
                  <th className="py-2">Date</th>
                  <th className="py-2">Status</th>
                  <th className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentInvoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="py-2">
                      <Link href={`/invoices/${inv.id}`} className="font-medium text-brand-600 hover:underline">
                        {inv.invoice_number}
                      </Link>
                    </td>
                    <td className="py-2 text-ink-700">{inv.customer_name ?? "-"}</td>
                    <td className="py-2 text-ink-700">{formatDate(inv.invoice_date)}</td>
                    <td className="py-2 capitalize text-ink-700">{inv.status.replace("_", " ")}</td>
                    <td className="py-2 text-right text-ink-800">{formatCurrency(inv.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink-800">Quick Actions</h2>
          <div className="space-y-2">
            <Link href="/invoices/new" className="block rounded-md border border-gray-200 px-3 py-2 text-sm text-ink-700 hover:border-brand-300 hover:bg-brand-50">
              + Create an Invoice
            </Link>
            <Link href="/customers/new" className="block rounded-md border border-gray-200 px-3 py-2 text-sm text-ink-700 hover:border-brand-300 hover:bg-brand-50">
              + Add a Customer
            </Link>
            <Link href="/payments-received/new" className="block rounded-md border border-gray-200 px-3 py-2 text-sm text-ink-700 hover:border-brand-300 hover:bg-brand-50">
              + Record a Payment
            </Link>
            <Link href="/expenses/new" className="block rounded-md border border-gray-200 px-3 py-2 text-sm text-ink-700 hover:border-brand-300 hover:bg-brand-50">
              + Record an Expense
            </Link>
            <Link href="/banking" className="block rounded-md border border-gray-200 px-3 py-2 text-sm text-ink-700 hover:border-brand-300 hover:bg-brand-50">
              + Connect a Bank Account
            </Link>
            <Link href="/chart-of-accounts/new" className="block rounded-md border border-gray-200 px-3 py-2 text-sm text-ink-700 hover:border-brand-300 hover:bg-brand-50">
              + Add an Account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
