"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Pencil, Wallet, MoreVertical, Ban } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import AttachmentsField from "@/components/attachments/AttachmentsField";
import JournalPanel, { type JournalLineData } from "@/components/accounting/JournalPanel";

interface BillData {
  id: string;
  billNumber: string;
  vendorId: string | null;
  billDate: string;
  dueDate: string | null;
  orderNumber: string | null;
  permitNumber: string | null;
  subject: string | null;
  paymentTerms: string;
  status: string;
  subtotal: number;
  taxTotal: number;
  total: number;
  balanceDue: number;
  notes: string | null;
}

interface VendorData {
  id: string;
  displayName: string;
}

interface LineData {
  id: string;
  description: string | null;
  quantity: number;
  rate: number;
  amount: number;
  accountId: string | null;
  accountName: string | null;
  taxName: string | null;
  taxRate: number | null;
  customerId: string | null;
  customerName: string | null;
}

interface PaymentData {
  id: string;
  paymentNumber: string;
  paymentDate: string;
  amount: number;
}

/** The Purchase Order(s) this bill was converted from, if any — see
 * purchase_orders.converted_bill_id and src/app/api/purchase-orders/[id]/convert-to-bill/route.ts.
 * In practice at most one today (each Convert to Bill call always creates a brand-new bill),
 * but queried/rendered as a list for robustness rather than assuming exactly one. */
interface PurchaseOrderData {
  id: string;
  poNumber: string;
  orderDate: string;
  status: string;
}

const STATUS_STYLES: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700",
  partially_paid: "bg-amber-100 text-amber-700",
  open: "bg-blue-100 text-blue-700",
  overdue: "bg-red-100 text-red-700",
  draft: "bg-gray-100 text-gray-500",
  void: "bg-gray-100 text-gray-400",
};
const STATUS_LABELS: Record<string, string> = {
  paid: "Paid",
  partially_paid: "Partially Paid",
  open: "Open",
  overdue: "Overdue",
  draft: "Draft",
  void: "Void",
};
const PAYMENT_TERM_LABELS: Record<string, string> = {
  due_on_receipt: "Due on Receipt",
  net_15: "Net 15",
  net_30: "Net 30",
  net_45: "Net 45",
  net_60: "Net 60",
};

// Mirrors PurchaseOrderDetailView.tsx's own STATUS_STYLES/STATUS_LABELS exactly, so the
// Purchase Orders panel below shows the same colors/wording that page uses for itself.
const PO_STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  confirmed: "bg-blue-50 text-blue-600",
  closed: "bg-emerald-50 text-emerald-600",
  void: "bg-red-50 text-red-600",
};
const PO_STATUS_LABELS: Record<string, string> = { void: "Cancelled" };

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm text-ink-700">{value || "-"}</p>
    </div>
  );
}

/** Client wrapper for /bills/[id] — was a pure server component until this added interactive
 * actions (Record Payment, Void) on top of what was already there. Same "click the account,
 * land on its own ledger" pattern the Expense detail view established: each item row's Account
 * is a link to /chart-of-accounts/[id]. */
export default function BillDetailView({
  bill,
  vendor,
  apAccountName,
  currency,
  lines,
  payments,
  journalLines,
  project,
  unit,
  purchaseOrders,
}: {
  bill: BillData;
  vendor: VendorData | null;
  apAccountName: string | null;
  currency: string;
  lines: LineData[];
  payments: PaymentData[];
  journalLines: JournalLineData[];
  project?: { id: string; name: string } | null;
  unit?: { id: string; name: string } | null;
  purchaseOrders: PurchaseOrderData[];
}) {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Only reachable once nothing has been paid against this bill yet — see voidBill's own
  // guard/comment in bills-api.ts for why (a voided bill with an existing payment allocation
  // would leave that payment with nowhere consistent to point).
  const canVoid = bill.status !== "void" && bill.balanceDue >= bill.total;

  async function voidBill() {
    setMenuOpen(false);
    if (!window.confirm(`Void bill ${bill.billNumber}? This can't be undone.`)) return;
    setUpdating(true);
    setError(null);
    try {
      const res = await fetch(`/api/bills/${bill.id}/void`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to void this bill.");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to void this bill.");
    } finally {
      setUpdating(false);
    }
  }

  const canRecordPayment = bill.status !== "draft" && bill.status !== "void" && bill.balanceDue > 0 && !!vendor;
  const recordPaymentHref = vendor ? `/payments-made/new?vendor=${vendor.id}&bill=${bill.id}` : "#";

  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/bills" className="mb-2 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600">
          <ChevronLeft size={12} /> All Bills
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-ink-800">{bill.billNumber}</h1>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[bill.status] ?? "bg-gray-100 text-gray-500"}`}>
              {STATUS_LABELS[bill.status] ?? bill.status}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/bills/${bill.id}/edit`} className="btn-secondary">
              <Pencil size={14} /> Edit
            </Link>
            {canRecordPayment && (
              <Link href={recordPaymentHref} className="btn-primary">
                <Wallet size={14} /> Record Payment
              </Link>
            )}
            <div className="relative" ref={menuRef}>
              <button type="button" onClick={() => setMenuOpen((v) => !v)} className="btn-secondary px-2" aria-label="More actions">
                <MoreVertical size={16} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 z-10 mt-1 w-56 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                  <button
                    type="button"
                    disabled={!canVoid || updating}
                    onClick={voidBill}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    title={!canVoid && bill.status !== "void" ? "This bill has payments applied — remove them before voiding." : undefined}
                  >
                    <Ban size={14} /> Void
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <p className="mt-0.5 text-sm text-gray-500">
          {formatDate(bill.billDate)} {vendor && <>&middot; {vendor.displayName}</>}
        </p>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      {bill.status === "open" && (
        <div className="mx-6 mt-6 card flex items-center justify-between bg-brand-50/50 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-ink-800">What&apos;s Next?</p>
            <p className="text-sm text-gray-500">This bill is in the open status. You can now record payment for this bill.</p>
          </div>
          {canRecordPayment && (
            <Link href={recordPaymentHref} className="btn-primary">
              <Wallet size={14} /> Record Payment
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className="card space-y-5 p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Bill Amount</p>
                <p className="mt-1 text-2xl font-semibold text-red-600">{formatCurrency(bill.total, currency)}</p>
                <p className="mt-0.5 text-xs text-gray-500">Balance Due: {formatCurrency(bill.balanceDue, currency)}</p>
              </div>
              <div className="text-right">
                {vendor && (
                  <Link href={`/vendors/${vendor.id}`} className="text-sm font-medium text-brand-600 hover:underline">
                    {vendor.displayName}
                  </Link>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-4 sm:grid-cols-4">
              <Field label="Order Number" value={bill.orderNumber} />
              <Field label="Permit#" value={bill.permitNumber} />
              <Field label="Due Date" value={bill.dueDate ? formatDate(bill.dueDate) : null} />
              <Field label="Payment Terms" value={PAYMENT_TERM_LABELS[bill.paymentTerms] ?? bill.paymentTerms} />
              <Field label="Subject" value={bill.subject} />
              <Field label="Accounts Payable" value={apAccountName ?? "Default"} />
            </div>

            {(project || unit) && (
              <div className="flex flex-wrap gap-6 border-t border-gray-100 pt-4 text-sm">
                {project && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Project</p>
                    <Link href={`/projects/${project.id}`} className="text-brand-600 hover:underline">
                      {project.name}
                    </Link>
                  </div>
                )}
                {unit && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Unit</p>
                    <Link href={`/inventory/${unit.id}`} className="text-brand-600 hover:underline">
                      {unit.name}
                    </Link>
                  </div>
                )}
              </div>
            )}

            <div className="border-t border-gray-100 pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Item Table</p>
              <div className="overflow-x-auto rounded-md border border-gray-100">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-3 py-2">Item Details</th>
                      <th className="px-3 py-2">Account</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Rate</th>
                      <th className="px-3 py-2">Tax</th>
                      <th className="px-3 py-2">Customer</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {lines.map((l) => (
                      <tr key={l.id}>
                        <td className="px-3 py-2 text-ink-700">{l.description}</td>
                        <td className="px-3 py-2">
                          {l.accountId ? (
                            <Link href={`/chart-of-accounts/${l.accountId}`} className="text-brand-600 hover:underline">
                              {l.accountName}
                            </Link>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-ink-700">{l.quantity}</td>
                        <td className="px-3 py-2 text-right text-ink-700">{formatCurrency(l.rate, currency)}</td>
                        <td className="px-3 py-2 text-ink-700">{l.taxName ? `${l.taxName} (${l.taxRate}%)` : "-"}</td>
                        <td className="px-3 py-2">
                          {l.customerId ? (
                            <Link href={`/customers/${l.customerId}`} className="text-brand-600 hover:underline">
                              {l.customerName}
                            </Link>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-ink-800">{formatCurrency(l.amount, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex justify-end">
                <div className="w-64 space-y-1.5 text-sm">
                  <div className="flex items-center justify-between text-ink-700">
                    <span>Sub Total</span>
                    <span>{formatCurrency(bill.subtotal, currency)}</span>
                  </div>
                  <div className="flex items-center justify-between text-ink-700">
                    <span>Tax</span>
                    <span>{formatCurrency(bill.taxTotal, currency)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-gray-100 pt-1.5 font-semibold text-ink-800">
                    <span>Total</span>
                    <span>{formatCurrency(bill.total, currency)}</span>
                  </div>
                </div>
              </div>
            </div>

            {bill.notes && (
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Notes</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">{bill.notes}</p>
              </div>
            )}
          </div>

          <JournalPanel title={`Bill - ${bill.billNumber}`} lines={journalLines} currency={currency} defaultOpen />

          <div className="card space-y-2 p-5">
            <h2 className="text-sm font-semibold text-ink-800">
              Purchase Orders {purchaseOrders.length > 0 && <span className="text-gray-400">{purchaseOrders.length}</span>}
            </h2>
            {purchaseOrders.length === 0 ? (
              <p className="text-sm text-gray-400">This bill was not created from a purchase order.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="border-y border-gray-100 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Purchase Order#</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {purchaseOrders.map((po) => (
                    <tr key={po.id}>
                      <td className="px-3 py-2 text-ink-700">{formatDate(po.orderDate)}</td>
                      <td className="px-3 py-2">
                        <Link href={`/purchase-orders/${po.id}`} className="text-brand-600 hover:underline">
                          {po.poNumber}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${PO_STATUS_STYLES[po.status] ?? "bg-gray-100 text-gray-500"}`}>
                          {PO_STATUS_LABELS[po.status] ?? po.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card space-y-2 p-5">
            <h2 className="text-sm font-semibold text-ink-800">Payments Made</h2>
            {payments.length === 0 ? (
              <p className="text-sm text-gray-400">No payments have been recorded against this bill yet.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="border-y border-gray-100 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Payment #</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className="px-3 py-2 text-ink-700">{formatDate(p.paymentDate)}</td>
                      <td className="px-3 py-2">
                        <Link href={`/payments-made/${p.id}`} className="text-brand-600 hover:underline">
                          {p.paymentNumber}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right text-ink-800">{formatCurrency(p.amount, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="card space-y-2 p-5">
            <h2 className="text-sm font-semibold text-ink-800">Attachments</h2>
            <AttachmentsField entityType="bills" entityId={bill.id} label="" />
          </div>
        </div>
      </div>
    </div>
  );
}
