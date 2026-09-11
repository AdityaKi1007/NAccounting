import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Pencil, Mail as MailIcon, Phone, Receipt } from "lucide-react";
import { requireActiveContext } from "@/lib/session";
import { query, queryOne } from "@/lib/db";
import { formatCurrency, formatDate, titleCase } from "@/lib/format";
import AttachmentsField from "@/components/attachments/AttachmentsField";
import EmailsList from "@/components/emails/EmailsList";

interface VendorRow {
  id: string;
  display_name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  billing_address: string | null;
  currency: string;
  is_active: boolean;
  created_at: string;
}

interface BillRow {
  id: string;
  bill_number: string;
  bill_date: string;
  status: string;
  total: number | string;
  balance_due: number | string;
}

interface PaymentMadeRow {
  id: string;
  payment_number: string;
  payment_date: string;
  amount: number | string;
}

interface VendorCreditRow {
  id: string;
  credit_note_number: string;
  credit_date: string;
  status: string;
  total: number | string;
}

interface PurchaseOrderRow {
  id: string;
  po_number: string;
  order_date: string;
  status: string;
  total: number | string;
}

type TxnRow = {
  key: string;
  kind: "Bill" | "Payment Made" | "Vendor Credit" | "Purchase Order";
  href: string;
  number: string;
  date: string;
  amount: number;
  status: string;
};

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm text-ink-700">{value || "-"}</p>
    </div>
  );
}

function txnStatusTone(status: string): "green" | "gray" | "amber" | "red" | "blue" {
  if (["paid", "closed"].includes(status)) return "green";
  if (["void", "overdue"].includes(status)) return "red";
  if (["draft"].includes(status)) return "gray";
  if (["partially_paid", "open", "confirmed"].includes(status)) return "amber";
  return "blue";
}

function StatusPill({ label, tone }: { label: string; tone: "green" | "gray" | "amber" | "red" | "blue" }) {
  const toneClass = {
    green: "bg-green-50 text-green-700",
    gray: "bg-gray-100 text-gray-600",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    blue: "bg-blue-50 text-blue-700",
  }[tone];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${toneClass}`}>{label}</span>;
}

export default async function VendorDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireActiveContext();

  const vendor = await queryOne<VendorRow>(
    `SELECT id, display_name, company_name, email, phone, billing_address, currency, is_active, created_at
     FROM vendors WHERE id = $1 AND organization_id = $2`,
    [params.id, ctx.orgId]
  );
  if (!vendor) notFound();

  const [bills, paymentsMade, vendorCredits, purchaseOrders] = await Promise.all([
    query<BillRow>(
      `SELECT id, bill_number, bill_date, status, total, balance_due
       FROM bills WHERE vendor_id = $1 AND organization_id = $2 ORDER BY bill_date DESC`,
      [params.id, ctx.orgId]
    ),
    query<PaymentMadeRow>(
      `SELECT id, payment_number, payment_date, amount
       FROM payments_made WHERE vendor_id = $1 AND organization_id = $2 ORDER BY payment_date DESC`,
      [params.id, ctx.orgId]
    ),
    query<VendorCreditRow>(
      `SELECT id, credit_note_number, credit_date, status, total
       FROM vendor_credits WHERE vendor_id = $1 AND organization_id = $2 ORDER BY credit_date DESC`,
      [params.id, ctx.orgId]
    ),
    query<PurchaseOrderRow>(
      `SELECT id, po_number, order_date, status, total
       FROM purchase_orders WHERE vendor_id = $1 AND organization_id = $2 ORDER BY order_date DESC`,
      [params.id, ctx.orgId]
    ),
  ]);

  // Outstanding payables: bills that have actually been posted (not draft) — bills have no
  // "void" status (see entities.ts), unlike invoices, so draft is the only exclusion needed.
  const outstandingPayables = bills.filter((b) => b.status !== "draft").reduce((sum, b) => sum + Number(b.balance_due), 0);

  // Purchases chart: same shape as the Customer detail page's Income chart (last 6 calendar
  // months, accrual basis on the bill's own date, non-draft only).
  const now = new Date();
  const months: { key: string; label: string; total: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      total: 0,
    });
  }
  for (const b of bills) {
    if (b.status === "draft") continue;
    const d = new Date(b.bill_date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const bucket = months.find((m) => m.key === key);
    if (bucket) bucket.total += Number(b.total);
  }
  const maxMonthTotal = Math.max(1, ...months.map((m) => m.total));
  const totalPurchases6mo = months.reduce((sum, m) => sum + m.total, 0);

  const org = await queryOne<{ currency: string }>(`SELECT currency FROM organizations WHERE id = $1`, [ctx.orgId]);
  const orgCurrency = org?.currency ?? vendor.currency ?? "AED";

  const transactions: TxnRow[] = [
    ...bills.map((b): TxnRow => ({
      key: `bill-${b.id}`,
      kind: "Bill",
      href: `/bills/${b.id}`,
      number: b.bill_number,
      date: b.bill_date,
      amount: Number(b.total),
      status: b.status,
    })),
    ...paymentsMade.map((p): TxnRow => ({
      key: `pmt-${p.id}`,
      kind: "Payment Made",
      href: `/payments-made/${p.id}`,
      number: p.payment_number,
      date: p.payment_date,
      amount: Number(p.amount),
      status: "paid",
    })),
    ...vendorCredits.map((v): TxnRow => ({
      key: `vc-${v.id}`,
      kind: "Vendor Credit",
      href: `/vendor-credits/${v.id}`,
      number: v.credit_note_number,
      date: v.credit_date,
      amount: Number(v.total),
      status: v.status,
    })),
    ...purchaseOrders.map((po): TxnRow => ({
      key: `po-${po.id}`,
      kind: "Purchase Order",
      href: `/purchase-orders/${po.id}`,
      number: po.po_number,
      date: po.order_date,
      amount: Number(po.total),
      status: po.status,
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const initial = (vendor.company_name || vendor.display_name || "?").trim().charAt(0).toUpperCase();

  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/vendors" className="mb-2 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600">
          <ChevronLeft size={12} /> Vendors
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-ink-800">{vendor.display_name}</h1>
            {!vendor.is_active && <StatusPill label="Inactive" tone="gray" />}
          </div>
          <Link href={`/vendors/${vendor.id}/edit`} className="btn-secondary">
            <Pencil size={14} /> Edit
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[360px_1fr]">
        {/* Left column */}
        <div className="space-y-6">
          <div className="card space-y-3 p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-100 text-base font-semibold text-brand-700">
                {initial}
              </span>
              <div>
                <p className="font-medium text-ink-800">{vendor.display_name}</p>
                {vendor.company_name && <p className="text-xs text-gray-500">{vendor.company_name}</p>}
              </div>
            </div>
            {vendor.email && (
              <p className="flex items-center gap-2 text-sm text-ink-700">
                <MailIcon size={14} className="text-gray-400" /> {vendor.email}
              </p>
            )}
            {vendor.phone && (
              <p className="flex items-center gap-2 text-sm text-ink-700">
                <Phone size={14} className="text-gray-400" /> {vendor.phone}
              </p>
            )}
          </div>

          <div className="card space-y-4 p-5">
            <h2 className="text-sm font-semibold text-ink-800">Address</h2>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Billing Address</p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-700">{vendor.billing_address || "-"}</p>
            </div>
          </div>

          <div className="card space-y-4 p-5">
            <h2 className="text-sm font-semibold text-ink-800">Other Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Default Currency" value={vendor.currency} />
              <Field label="Status" value={vendor.is_active ? "Active" : "Inactive"} />
            </div>
          </div>

          <div className="card space-y-2 p-5">
            <h2 className="text-sm font-semibold text-ink-800">Documents</h2>
            <AttachmentsField entityType="vendors" entityId={vendor.id} label="" />
          </div>

          <div className="card space-y-2 p-5">
            <h2 className="text-sm font-semibold text-ink-800">Emails</h2>
            <EmailsList partyType="vendor" partyId={vendor.id} />
          </div>

          <div className="card space-y-2 p-5">
            <h2 className="text-sm font-semibold text-ink-800">Record Info</h2>
            <Field label="Created On" value={formatDate(vendor.created_at)} />
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <div className="card p-0">
            <div className="border-b border-gray-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-ink-800">Payables</h2>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-2.5">Currency</th>
                  <th className="px-5 py-2.5 text-right">Outstanding Payables</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-5 py-3 text-ink-700">{vendor.currency} - {vendor.currency === "AED" ? "UAE Dirham" : vendor.currency}</td>
                  <td className="px-5 py-3 text-right text-ink-800">{formatCurrency(outstandingPayables, orgCurrency)}</td>
                </tr>
              </tbody>
            </table>
            <div className="border-t border-gray-100 px-5 py-3">
              <Link href={`/vendors/${vendor.id}/edit`} className="text-sm text-brand-600 hover:underline">
                Enter Opening Balance
              </Link>
            </div>
          </div>

          <div className="card p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-ink-800">Purchases</h2>
                <p className="text-xs text-gray-400">Shown in the organization&apos;s base currency.</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="rounded-md bg-gray-100 px-2 py-1">Last 6 Months</span>
                <span className="rounded-md bg-gray-100 px-2 py-1">Accrual</span>
              </div>
            </div>
            <div className="flex items-end gap-4 border-b border-gray-100 pb-3" style={{ height: 140 }}>
              {months.map((m) => (
                <div key={m.key} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-xs text-gray-500">{m.total > 0 ? formatCurrency(m.total, orgCurrency) : ""}</span>
                  <div
                    className="w-full max-w-[36px] rounded-t bg-brand-500"
                    style={{ height: `${Math.max(4, (m.total / maxMonthTotal) * 90)}px` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-4">
              {months.map((m) => (
                <span key={m.key} className="flex-1 text-center text-xs text-gray-400">
                  {m.label}
                </span>
              ))}
            </div>
            <p className="mt-4 text-sm text-ink-700">
              Total Purchases (Last 6 Months) - <span className="font-semibold">{formatCurrency(totalPurchases6mo, orgCurrency)}</span>
            </p>
          </div>

          <div className="card p-0">
            <div className="border-b border-gray-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-ink-800">Recent Transactions</h2>
            </div>
            {transactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
                <Receipt size={26} className="text-gray-300" />
                <p className="text-sm text-gray-500">No transactions yet for this vendor.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-5 py-2.5">Type</th>
                      <th className="px-5 py-2.5">Number</th>
                      <th className="px-5 py-2.5">Date</th>
                      <th className="px-5 py-2.5 text-right">Amount</th>
                      <th className="px-5 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {transactions.map((t) => (
                      <tr key={t.key} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-5 py-2.5 text-ink-700">{t.kind}</td>
                        <td className="whitespace-nowrap px-5 py-2.5">
                          <Link href={t.href} className="font-medium text-brand-600 hover:underline">
                            {t.number}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-5 py-2.5 text-ink-700">{formatDate(t.date)}</td>
                        <td className="whitespace-nowrap px-5 py-2.5 text-right text-ink-800">{formatCurrency(t.amount, orgCurrency)}</td>
                        <td className="whitespace-nowrap px-5 py-2.5">
                          <StatusPill label={titleCase(t.status)} tone={txnStatusTone(t.status)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
