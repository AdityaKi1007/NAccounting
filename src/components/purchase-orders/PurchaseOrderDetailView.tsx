"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Pencil, Download, Printer, MoreVertical, CheckCircle2, FileText, Trash2, Mail, Ban, ListX } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { generatePdfBlob, downloadPdfBlob } from "@/lib/pdf-export";
import AttachmentsField from "@/components/attachments/AttachmentsField";
import EmailsList from "@/components/emails/EmailsList";
import SendEmailModal from "@/components/emails/SendEmailModal";
import Modal from "@/components/ui/Modal";

interface PurchaseOrderData {
  id: string;
  poNumber: string;
  orderDate: string;
  expectedDeliveryDate: string | null;
  referenceNumber: string | null;
  status: string;
  subtotal: number;
  taxTotal: number;
  total: number;
  notes: string | null;
  termsConditions: string | null;
  convertedBillId: string | null;
}

interface VendorData {
  displayName: string;
  companyName: string | null;
  billingAddress: string | null;
  email: string | null;
}

interface LineData {
  id: string;
  description: string;
  quantity: number;
  rate: number;
  discountPercent: number;
  amount: number;
  /** See migration 1788000000000 + "Cancel Items" below — a cancelled line stays on the PO
   * for the record (struck through) but is excluded from Subtotal/Tax/Total and from what
   * "Convert to Bill" pulls in. */
  cancelled: boolean;
}

interface BillSummary {
  id: string;
  billNumber: string;
  status: string;
  total: number;
  balanceDue: number;
}

interface AccountOption {
  value: string;
  label: string;
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  confirmed: "bg-blue-50 text-blue-600",
  closed: "bg-emerald-50 text-emerald-600",
  void: "bg-red-50 text-red-600",
};
// The underlying status value stays "void" (same column/value every other document type in
// this app uses for this state — see entities.ts's "purchase-orders" field options), but the
// user-facing wording on this page follows the Zoho reference screenshot's "Mark as Canceled" /
// "Cancelled" terminology — a display-only override scoped to this detail view, not a rename
// of the shared status.
const STATUS_LABELS: Record<string, string> = { void: "Cancelled" };

// Mirrors bills/[id]/page.tsx's own STATUS_STYLES/STATUS_LABELS exactly, so the Bills panel
// below shows the same colors/wording the Bill's own detail page uses.
const BILL_STATUS_STYLES: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700",
  partially_paid: "bg-amber-100 text-amber-700",
  open: "bg-blue-100 text-blue-700",
  overdue: "bg-red-100 text-red-700",
  draft: "bg-gray-100 text-gray-500",
};
const BILL_STATUS_LABELS: Record<string, string> = {
  paid: "Paid",
  partially_paid: "Partially Paid",
  open: "Open",
  overdue: "Overdue",
  draft: "Draft",
};

export default function PurchaseOrderDetailView({
  purchaseOrder,
  vendor,
  org,
  currency,
  lines,
  bill,
  accountOptions,
}: {
  purchaseOrder: PurchaseOrderData;
  vendor: VendorData | null;
  org: { name: string; addressLines: string[]; logoDataUri?: string | null };
  currency: string;
  lines: LineData[];
  /** The Bill this purchase order was converted into, if any — see "Convert to Bill" below. */
  bill: BillSummary | null;
  /** Expense-like accounts to choose from when converting to a Bill (a purchase order line has
   * no account_id of its own — see the convert-to-bill route's own comment). */
  accountOptions: AccountOption[];
}) {
  const router = useRouter();
  const printRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailRefreshSignal, setEmailRefreshSignal] = useState(0);
  const [billModalOpen, setBillModalOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [cancelItemsModalOpen, setCancelItemsModalOpen] = useState(false);
  const [cancelledLineIds, setCancelledLineIds] = useState<Set<string>>(() => new Set(lines.filter((l) => l.cancelled).map((l) => l.id)));

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function downloadPdf() {
    if (!printRef.current) return;
    setDownloading(true);
    try {
      const blob = await generatePdfBlob(printRef.current);
      downloadPdfBlob(blob, `${purchaseOrder.poNumber}.pdf`);
    } finally {
      setDownloading(false);
    }
  }

  async function setStatus(status: string) {
    setUpdating(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/purchase-orders/${purchaseOrder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ header: { status } }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update status.");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update status.");
    } finally {
      setUpdating(false);
    }
  }

  async function convertToBill() {
    if (!selectedAccount) {
      setError("Please choose an Account.");
      return;
    }
    setUpdating(true);
    setError(null);
    try {
      const res = await fetch(`/api/purchase-orders/${purchaseOrder.id}/convert-to-bill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: selectedAccount }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to convert to bill.");
      setBillModalOpen(false);
      router.push(`/bills/${data.billId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to convert to bill.");
    } finally {
      setUpdating(false);
    }
  }

  async function saveCancelledItems() {
    setUpdating(true);
    setError(null);
    try {
      const res = await fetch(`/api/purchase-orders/${purchaseOrder.id}/cancel-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancelled_item_ids: Array.from(cancelledLineIds) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update cancelled items.");
      }
      setCancelItemsModalOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update cancelled items.");
    } finally {
      setUpdating(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete purchase order ${purchaseOrder.poNumber}? This can't be undone.`)) return;
    setUpdating(true);
    setError(null);
    try {
      const res = await fetch(`/api/entities/purchase-orders/${purchaseOrder.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete purchase order.");
      }
      router.push("/purchase-orders");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete purchase order.");
      setUpdating(false);
    }
  }

  const vendorName = vendor?.companyName ? `${vendor.displayName} (${vendor.companyName})` : vendor?.displayName ?? "-";
  const statusBadge = STATUS_STYLES[purchaseOrder.status] ?? "bg-gray-100 text-gray-600";

  return (
    <div>
      <style>{`@media print { .no-print { display: none !important; } }`}</style>

      <div className="no-print border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/purchase-orders" className="mb-2 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600">
          <ChevronLeft size={12} /> All Purchase Orders
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-ink-800">{purchaseOrder.poNumber}</h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusBadge}`}>
              {STATUS_LABELS[purchaseOrder.status] ?? purchaseOrder.status}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/purchase-orders/${purchaseOrder.id}/edit`} className="btn-secondary">
              <Pencil size={14} /> Edit
            </Link>
            <button type="button" onClick={() => window.print()} className="btn-secondary">
              <Printer size={14} /> Print
            </button>
            <button type="button" onClick={downloadPdf} disabled={downloading} className="btn-primary">
              <Download size={14} /> {downloading ? "Preparing..." : "Download PDF"}
            </button>
            {purchaseOrder.status === "draft" && (
              <button type="button" onClick={() => setStatus("confirmed")} disabled={updating} className="btn-secondary">
                <CheckCircle2 size={14} /> Mark as Confirmed
              </button>
            )}
            {purchaseOrder.status === "confirmed" && (
              <button type="button" onClick={() => setStatus("closed")} disabled={updating} className="btn-secondary">
                <CheckCircle2 size={14} /> Mark as Completed
              </button>
            )}
            {purchaseOrder.convertedBillId ? (
              <Link href={`/bills/${purchaseOrder.convertedBillId}`} className="btn-secondary">
                <FileText size={14} /> View Bill
              </Link>
            ) : (
              <button
                type="button"
                disabled={purchaseOrder.status === "void" || updating}
                onClick={() => setBillModalOpen(true)}
                className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FileText size={14} /> Convert to Bill
              </button>
            )}
            <div className="relative" ref={menuRef}>
              <button type="button" onClick={() => setMenuOpen((v) => !v)} className="btn-secondary px-2" aria-label="More actions">
                <MoreVertical size={16} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 z-10 mt-1 w-56 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setEmailModalOpen(true);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-700 hover:bg-gray-50"
                  >
                    <Mail size={14} /> Send Email
                  </button>
                  <div className="my-1 border-t border-gray-100" />
                  <button
                    type="button"
                    disabled={purchaseOrder.status === "void" || !!purchaseOrder.convertedBillId || updating || lines.length === 0}
                    onClick={() => {
                      setMenuOpen(false);
                      setCancelledLineIds(new Set(lines.filter((l) => l.cancelled).map((l) => l.id)));
                      setCancelItemsModalOpen(true);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    title={purchaseOrder.convertedBillId ? "This purchase order has already been converted to a bill." : undefined}
                  >
                    <ListX size={14} /> Cancel Items
                  </button>
                  {purchaseOrder.status !== "void" && purchaseOrder.status !== "closed" && (
                    <button
                      type="button"
                      disabled={updating}
                      onClick={() => {
                        setMenuOpen(false);
                        setStatus("void");
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Ban size={14} /> Mark as Canceled
                    </button>
                  )}
                  <div className="my-1 border-t border-gray-100" />
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      handleDelete();
                    }}
                    disabled={updating}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      <div className="p-6">
        {purchaseOrder.status === "draft" && (
          <div className="no-print card mb-6 flex items-center justify-between bg-brand-50/50 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-ink-800">What&apos;s Next?</p>
              <p className="text-sm text-gray-500">Send this Purchase Order to your vendor, or mark it as Confirmed.</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setEmailModalOpen(true)} className="btn-secondary">
                Send Purchase Order
              </button>
              <button type="button" onClick={() => setStatus("confirmed")} disabled={updating} className="btn-primary">
                Mark as Confirmed
              </button>
            </div>
          </div>
        )}

        <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          {purchaseOrder.status === "closed" && (
            <span className="absolute left-0 top-0 -translate-x-[30%] -translate-y-[10%] -rotate-45 bg-emerald-500 px-8 py-1 text-xs font-semibold uppercase tracking-wide text-white">
              Completed
            </span>
          )}
          {purchaseOrder.status === "confirmed" && (
            <span className="absolute left-0 top-0 -translate-x-[30%] -translate-y-[10%] -rotate-45 bg-blue-500 px-8 py-1 text-xs font-semibold uppercase tracking-wide text-white">
              Confirmed
            </span>
          )}
          <div ref={printRef} className="bg-white p-8">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                {org.logoDataUri && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={org.logoDataUri} alt="" className="h-12 w-12 shrink-0 rounded object-contain" />
                )}
                <div>
                  <p className="text-base font-semibold text-ink-800">{org.name}</p>
                  {org.addressLines.map((line, i) => (
                    <p key={i} className="text-sm text-gray-500">
                      {line}
                    </p>
                  ))}
                </div>
              </div>
              <div className="text-right">
                <h2 className="text-2xl font-bold tracking-wide text-ink-900">PURCHASE ORDER</h2>
                <p className="mt-1 text-sm text-gray-500">Purchase Order# {purchaseOrder.poNumber}</p>
              </div>
            </div>

            <div className="mt-6 flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Vendor</p>
                <p className="mt-1 text-sm font-medium text-ink-800">{vendorName}</p>
                {vendor?.billingAddress
                  ?.split("\n")
                  .filter(Boolean)
                  .map((line, i) => (
                    <p key={i} className="text-sm text-gray-500">
                      {line}
                    </p>
                  ))}
              </div>
              <div className="text-right text-sm">
                <p className="font-semibold text-ink-800">Total</p>
                <p className="text-xl font-bold text-ink-900">{formatCurrency(purchaseOrder.total, currency)}</p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-4 border-t border-gray-100 pt-4 text-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Order Date</p>
                <p className="text-ink-700">{formatDate(purchaseOrder.orderDate)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Expected Delivery Date</p>
                <p className="text-ink-700">{purchaseOrder.expectedDeliveryDate ? formatDate(purchaseOrder.expectedDeliveryDate) : "-"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Ref#</p>
                <p className="text-ink-700">{purchaseOrder.referenceNumber || "-"}</p>
              </div>
            </div>

            <table className="mt-6 w-full text-left text-sm">
              <thead className="border-y border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Item &amp; Description</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Rate</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((line, i) => (
                  <tr key={i} className={line.cancelled ? "bg-gray-50/60" : undefined}>
                    <td className={`px-3 py-2 text-ink-700 ${line.cancelled ? "line-through opacity-50" : ""}`}>{i + 1}</td>
                    <td className={`px-3 py-2 text-ink-700 ${line.cancelled ? "line-through opacity-50" : ""}`}>
                      {line.description}
                      {line.cancelled && (
                        <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-500 no-underline">
                          Cancelled
                        </span>
                      )}
                    </td>
                    <td className={`px-3 py-2 text-right text-ink-700 ${line.cancelled ? "line-through opacity-50" : ""}`}>{line.quantity}</td>
                    <td className={`px-3 py-2 text-right text-ink-700 ${line.cancelled ? "line-through opacity-50" : ""}`}>
                      {formatCurrency(line.rate, currency)}
                    </td>
                    <td className={`px-3 py-2 text-right text-ink-800 ${line.cancelled ? "line-through opacity-50" : ""}`}>
                      {formatCurrency(line.amount, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 flex justify-end">
              <div className="w-64 space-y-1.5 text-sm">
                <div className="flex items-center justify-between text-ink-700">
                  <span>Sub Total</span>
                  <span>{formatCurrency(purchaseOrder.subtotal, currency)}</span>
                </div>
                {purchaseOrder.taxTotal > 0 && (
                  <div className="flex items-center justify-between text-ink-700">
                    <span>Tax</span>
                    <span>{formatCurrency(purchaseOrder.taxTotal, currency)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-gray-100 pt-1.5 font-semibold text-ink-900">
                  <span>Total</span>
                  <span>{formatCurrency(purchaseOrder.total, currency)}</span>
                </div>
              </div>
            </div>

            {purchaseOrder.notes && (
              <div className="mt-6 border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Notes</p>
                <p className="mt-1 whitespace-pre-line text-sm text-gray-600">{purchaseOrder.notes}</p>
              </div>
            )}

            {purchaseOrder.termsConditions && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Terms &amp; Conditions</p>
                <p className="mt-1 whitespace-pre-line text-sm text-gray-600">{purchaseOrder.termsConditions}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="no-print space-y-6 px-6 pb-6">
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink-800">Bills</h2>
          {bill ? (
            <div className="flex items-center justify-between rounded-md border border-gray-100 px-4 py-3">
              <div className="flex items-center gap-3">
                <Link href={`/bills/${bill.id}`} className="text-sm font-medium text-brand-600 hover:underline">
                  {bill.billNumber}
                </Link>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BILL_STATUS_STYLES[bill.status] ?? "bg-gray-100 text-gray-500"}`}>
                  {BILL_STATUS_LABELS[bill.status] ?? bill.status}
                </span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-500">
                  Total <span className="font-medium text-ink-800">{formatCurrency(bill.total, currency)}</span>
                </span>
                {bill.balanceDue > 0 && (
                  <span className="text-gray-500">
                    Balance Due <span className="font-medium text-ink-800">{formatCurrency(bill.balanceDue, currency)}</span>
                  </span>
                )}
                <Link href={`/bills/${bill.id}`} className="btn-secondary py-1 text-xs">
                  <FileText size={13} /> View Bill
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-md border border-dashed border-gray-200 px-4 py-3">
              <p className="text-sm text-gray-500">No bill has been created from this purchase order yet.</p>
              <button
                type="button"
                disabled={purchaseOrder.status === "void" || updating}
                onClick={() => setBillModalOpen(true)}
                className="btn-secondary py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FileText size={13} /> Convert to Bill
              </button>
            </div>
          )}
        </div>
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink-800">Attachments</h2>
          <AttachmentsField entityType="purchase-orders" entityId={purchaseOrder.id} label="" />
        </div>
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink-800">Emails</h2>
          <EmailsList entityType="purchase-orders" entityId={purchaseOrder.id} refreshSignal={emailRefreshSignal} />
        </div>
      </div>

      <SendEmailModal
        open={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        entityType="purchase-orders"
        entityId={purchaseOrder.id}
        docNumber={purchaseOrder.poNumber}
        orgName={org.name}
        partyName={vendorName}
        defaultToEmail={vendor?.email ?? null}
        printRef={printRef}
        onSent={() => setEmailRefreshSignal((n) => n + 1)}
      />

      <Modal open={billModalOpen} onClose={() => setBillModalOpen(false)} title="Convert to Bill">
        <div className="space-y-4">
          <div>
            <label className="label">Account</label>
            <select className="input" value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)}>
              <option value="">Select an account</option>
              {accountOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400">
              Every line item on this purchase order will post to this Account on the new bill — a purchase order
              line doesn&apos;t carry its own Account the way a Bill&apos;s line items do.
            </p>
            {accountOptions.length === 0 && (
              <p className="mt-1 text-xs text-gray-400">
                No expense/COGS accounts yet — add one under Accounting &rarr; Chart of Accounts first.
              </p>
            )}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setBillModalOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="button" onClick={convertToBill} disabled={updating} className="btn-primary">
              {updating ? "Converting..." : "Convert"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={cancelItemsModalOpen} onClose={() => setCancelItemsModalOpen(false)} title="Cancel Items">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Choose which line items can no longer be supplied. Cancelled items stay on this purchase order for the
            record, but are excluded from its Subtotal/Tax/Total and won&apos;t be included in &quot;Convert to
            Bill&quot;.
          </p>
          <div className="max-h-72 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200">
            {lines.map((line) => {
              const checked = cancelledLineIds.has(line.id);
              return (
                <label key={line.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-gray-50">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    checked={checked}
                    onChange={(e) => {
                      setCancelledLineIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(line.id);
                        else next.delete(line.id);
                        return next;
                      });
                    }}
                  />
                  <div className="flex flex-1 items-center justify-between gap-3">
                    <span className={`text-sm text-ink-700 ${checked ? "line-through opacity-50" : ""}`}>{line.description}</span>
                    <span className={`shrink-0 text-sm text-ink-800 ${checked ? "line-through opacity-50" : ""}`}>
                      {formatCurrency(line.amount, currency)}
                    </span>
                  </div>
                </label>
              );
            })}
            {lines.length === 0 && <p className="px-3 py-2.5 text-sm text-gray-400">No line items on this purchase order.</p>}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCancelItemsModalOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="button" onClick={saveCancelledItems} disabled={updating} className="btn-primary">
              {updating ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
