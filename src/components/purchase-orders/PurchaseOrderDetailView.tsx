"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Pencil, Download, Printer, MoreVertical, CheckCircle2, Trash2, Mail } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { generatePdfBlob, downloadPdfBlob } from "@/lib/pdf-export";
import AttachmentsField from "@/components/attachments/AttachmentsField";
import EmailsList from "@/components/emails/EmailsList";
import SendEmailModal from "@/components/emails/SendEmailModal";

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
}

interface VendorData {
  displayName: string;
  companyName: string | null;
  billingAddress: string | null;
  email: string | null;
}

interface LineData {
  description: string;
  quantity: number;
  rate: number;
  discountPercent: number;
  amount: number;
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  confirmed: "bg-blue-50 text-blue-600",
  closed: "bg-emerald-50 text-emerald-600",
  void: "bg-red-50 text-red-600",
};

export default function PurchaseOrderDetailView({
  purchaseOrder,
  vendor,
  org,
  currency,
  lines,
}: {
  purchaseOrder: PurchaseOrderData;
  vendor: VendorData | null;
  org: { name: string; addressLines: string[] };
  currency: string;
  lines: LineData[];
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
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusBadge}`}>{purchaseOrder.status}</span>
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
              <div>
                <p className="text-base font-semibold text-ink-800">{org.name}</p>
                {org.addressLines.map((line, i) => (
                  <p key={i} className="text-sm text-gray-500">
                    {line}
                  </p>
                ))}
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
    </div>
  );
}
