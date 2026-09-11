"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Pencil,
  Download,
  Printer,
  MoreVertical,
  CheckCircle2,
  FileText,
  ShoppingBag,
  Trash2,
  Mail,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { generatePdfBlob, downloadPdfBlob } from "@/lib/pdf-export";
import Modal from "@/components/ui/Modal";
import AttachmentsField from "@/components/attachments/AttachmentsField";
import EmailsList from "@/components/emails/EmailsList";
import SendEmailModal from "@/components/emails/SendEmailModal";

interface SalesOrderData {
  id: string;
  soNumber: string;
  orderDate: string;
  shipmentDate: string | null;
  referenceNumber: string | null;
  status: string;
  subtotal: number;
  taxTotal: number;
  total: number;
  notes: string | null;
  termsConditions: string | null;
  convertedInvoiceId: string | null;
  convertedPurchaseOrderId: string | null;
}

interface CustomerData {
  displayName: string;
  companyName: string | null;
  billingAddress: string | null;
  shippingAddress: string | null;
  email: string | null;
}

interface LineData {
  description: string;
  quantity: number;
  rate: number;
  discountPercent: number;
  amount: number;
}

interface VendorOption {
  id: string;
  displayName: string;
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  confirmed: "bg-blue-50 text-blue-600",
  closed: "bg-emerald-50 text-emerald-600",
  void: "bg-red-50 text-red-600",
};

export default function SalesOrderDetailView({
  salesOrder,
  customer,
  org,
  currency,
  lines,
  vendors,
}: {
  salesOrder: SalesOrderData;
  customer: CustomerData | null;
  org: { name: string; addressLines: string[] };
  currency: string;
  lines: LineData[];
  vendors: VendorOption[];
}) {
  const router = useRouter();
  const printRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [vendorModalOpen, setVendorModalOpen] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailRefreshSignal, setEmailRefreshSignal] = useState(0);

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
      downloadPdfBlob(blob, `${salesOrder.soNumber}.pdf`);
    } finally {
      setDownloading(false);
    }
  }

  async function setStatus(status: string) {
    setUpdating(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/sales-orders/${salesOrder.id}`, {
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

  async function convertToInvoice() {
    setMenuOpen(false);
    setUpdating(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales-orders/${salesOrder.id}/convert-to-invoice`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to convert to invoice.");
      router.push(`/invoices/${data.invoiceId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to convert to invoice.");
      setUpdating(false);
    }
  }

  async function convertToPurchaseOrder() {
    if (!selectedVendor) {
      setError("Please choose a vendor.");
      return;
    }
    setUpdating(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales-orders/${salesOrder.id}/convert-to-purchase-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendor_id: selectedVendor }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to convert to purchase order.");
      setVendorModalOpen(false);
      router.push(`/purchase-orders/${data.purchaseOrderId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to convert to purchase order.");
    } finally {
      setUpdating(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete sales order ${salesOrder.soNumber}? This can't be undone.`)) return;
    setUpdating(true);
    setError(null);
    try {
      const res = await fetch(`/api/entities/sales-orders/${salesOrder.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete sales order.");
      }
      router.push("/sales-orders");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete sales order.");
      setUpdating(false);
    }
  }

  const billToName = customer?.companyName ? `${customer.displayName} (${customer.companyName})` : customer?.displayName ?? "-";
  const statusBadge = STATUS_STYLES[salesOrder.status] ?? "bg-gray-100 text-gray-600";
  const canConvert = salesOrder.status !== "void";

  return (
    <div>
      <style>{`@media print { .no-print { display: none !important; } }`}</style>

      <div className="no-print border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/sales-orders" className="mb-2 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600">
          <ChevronLeft size={12} /> All Sales Orders
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-ink-800">{salesOrder.soNumber}</h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusBadge}`}>{salesOrder.status}</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/sales-orders/${salesOrder.id}/edit`} className="btn-secondary">
              <Pencil size={14} /> Edit
            </Link>
            <button type="button" onClick={() => window.print()} className="btn-secondary">
              <Printer size={14} /> Print
            </button>
            <button type="button" onClick={downloadPdf} disabled={downloading} className="btn-primary">
              <Download size={14} /> {downloading ? "Preparing..." : "Download PDF"}
            </button>
            {salesOrder.status === "draft" && (
              <button type="button" onClick={() => setStatus("confirmed")} disabled={updating} className="btn-secondary">
                <CheckCircle2 size={14} /> Mark as Confirmed
              </button>
            )}
            {salesOrder.status === "confirmed" && (
              <button type="button" onClick={() => setStatus("closed")} disabled={updating} className="btn-secondary">
                <CheckCircle2 size={14} /> Mark as Completed
              </button>
            )}
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="btn-secondary px-2"
                aria-label="More actions"
              >
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
                  {salesOrder.convertedInvoiceId ? (
                    <Link
                      href={`/invoices/${salesOrder.convertedInvoiceId}`}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-gray-50"
                      onClick={() => setMenuOpen(false)}
                    >
                      <FileText size={14} /> View Invoice
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled={!canConvert || updating}
                      onClick={convertToInvoice}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <FileText size={14} /> Convert to Invoice
                    </button>
                  )}
                  {salesOrder.convertedPurchaseOrderId ? (
                    <Link
                      href={`/purchase-orders/${salesOrder.convertedPurchaseOrderId}`}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-gray-50"
                      onClick={() => setMenuOpen(false)}
                    >
                      <ShoppingBag size={14} /> View Purchase Order
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled={!canConvert || updating}
                      onClick={() => {
                        setMenuOpen(false);
                        setVendorModalOpen(true);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ShoppingBag size={14} /> Convert to Purchase Order
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
        {salesOrder.status === "draft" && (
          <div className="no-print card mb-6 flex items-center justify-between bg-brand-50/50 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-ink-800">What&apos;s Next?</p>
              <p className="text-sm text-gray-500">Send this Sales Order to your customer, or mark it as Confirmed.</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setEmailModalOpen(true)} className="btn-secondary">
                Send Sales Order
              </button>
              <button type="button" onClick={() => setStatus("confirmed")} disabled={updating} className="btn-primary">
                Mark as Confirmed
              </button>
            </div>
          </div>
        )}

        <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          {salesOrder.status === "closed" && (
            <span className="absolute left-0 top-0 -translate-x-[30%] -translate-y-[10%] -rotate-45 bg-emerald-500 px-8 py-1 text-xs font-semibold uppercase tracking-wide text-white">
              Completed
            </span>
          )}
          {salesOrder.status === "confirmed" && (
            <span className="absolute left-0 top-0 -translate-x-[30%] -translate-y-[10%] -rotate-45 bg-blue-500 px-8 py-1 text-xs font-semibold uppercase tracking-wide text-white">
              Confirmed
            </span>
          )}
          <div ref={printRef} className="bg-white p-8">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-base font-semibold text-ink-800">{org.name}</p>
                {org.addressLines.map((line, i) => (
                  <p key={i} className="text-sm text-gray-500">
                    {line}
                  </p>
                ))}
              </div>
              <div className="text-right">
                <h2 className="text-2xl font-bold tracking-wide text-ink-900">SALES ORDER</h2>
                <p className="mt-1 text-sm text-gray-500">Sales Order# {salesOrder.soNumber}</p>
              </div>
            </div>

            <div className="mt-6 flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Bill To</p>
                <p className="mt-1 text-sm font-medium text-ink-800">{billToName}</p>
                {customer?.billingAddress
                  ?.split("\n")
                  .filter(Boolean)
                  .map((line, i) => (
                    <p key={i} className="text-sm text-gray-500">
                      {line}
                    </p>
                  ))}
              </div>
              {customer?.shippingAddress && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Ship To</p>
                  {customer.shippingAddress
                    .split("\n")
                    .filter(Boolean)
                    .map((line, i) => (
                      <p key={i} className="text-sm text-gray-500">
                        {line}
                      </p>
                    ))}
                </div>
              )}
              <div className="text-right text-sm">
                <p className="font-semibold text-ink-800">Total</p>
                <p className="text-xl font-bold text-ink-900">{formatCurrency(salesOrder.total, currency)}</p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-4 border-t border-gray-100 pt-4 text-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Order Date</p>
                <p className="text-ink-700">{formatDate(salesOrder.orderDate)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Expected Shipment Date</p>
                <p className="text-ink-700">{salesOrder.shipmentDate ? formatDate(salesOrder.shipmentDate) : "-"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Ref#</p>
                <p className="text-ink-700">{salesOrder.referenceNumber || "-"}</p>
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
                  <tr key={i}>
                    <td className="px-3 py-2 text-ink-700">{i + 1}</td>
                    <td className="px-3 py-2 text-ink-700">{line.description}</td>
                    <td className="px-3 py-2 text-right text-ink-700">{line.quantity}</td>
                    <td className="px-3 py-2 text-right text-ink-700">{formatCurrency(line.rate, currency)}</td>
                    <td className="px-3 py-2 text-right text-ink-800">{formatCurrency(line.amount, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 flex justify-end">
              <div className="w-64 space-y-1.5 text-sm">
                <div className="flex items-center justify-between text-ink-700">
                  <span>Sub Total</span>
                  <span>{formatCurrency(salesOrder.subtotal, currency)}</span>
                </div>
                {salesOrder.taxTotal > 0 && (
                  <div className="flex items-center justify-between text-ink-700">
                    <span>Tax</span>
                    <span>{formatCurrency(salesOrder.taxTotal, currency)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-gray-100 pt-1.5 font-semibold text-ink-900">
                  <span>Total</span>
                  <span>{formatCurrency(salesOrder.total, currency)}</span>
                </div>
              </div>
            </div>

            {salesOrder.notes && (
              <div className="mt-6 border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Customer Notes</p>
                <p className="mt-1 whitespace-pre-line text-sm text-gray-600">{salesOrder.notes}</p>
              </div>
            )}

            {salesOrder.termsConditions && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Terms &amp; Conditions</p>
                <p className="mt-1 whitespace-pre-line text-sm text-gray-600">{salesOrder.termsConditions}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="no-print space-y-6 px-6 pb-6">
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink-800">Attachments</h2>
          <AttachmentsField entityType="sales-orders" entityId={salesOrder.id} label="" />
        </div>
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink-800">Emails</h2>
          <EmailsList entityType="sales-orders" entityId={salesOrder.id} refreshSignal={emailRefreshSignal} />
        </div>
      </div>

      <SendEmailModal
        open={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        entityType="sales-orders"
        entityId={salesOrder.id}
        docNumber={salesOrder.soNumber}
        orgName={org.name}
        partyName={billToName}
        defaultToEmail={customer?.email ?? null}
        printRef={printRef}
        onSent={() => setEmailRefreshSignal((n) => n + 1)}
      />

      <Modal open={vendorModalOpen} onClose={() => setVendorModalOpen(false)} title="Convert to Purchase Order">
        <div className="space-y-4">
          <div>
            <label className="label">Vendor</label>
            <select
              className="input"
              value={selectedVendor}
              onChange={(e) => setSelectedVendor(e.target.value)}
            >
              <option value="">Select a vendor</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.displayName}
                </option>
              ))}
            </select>
            {vendors.length === 0 && (
              <p className="mt-1 text-xs text-gray-400">
                No vendors yet — add one under Buys &rarr; Vendors first.
              </p>
            )}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setVendorModalOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="button" onClick={convertToPurchaseOrder} disabled={updating} className="btn-primary">
              {updating ? "Converting..." : "Convert"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
