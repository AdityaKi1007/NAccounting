import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Pencil } from "lucide-react";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";
import { query, queryOne } from "@/lib/db";
import { formatCurrency, formatDate, titleCase } from "@/lib/format";

interface UnitRow {
  id: string;
  name: string;
  code: string | null;
  floor: string | null;
  area: number | string | null;
  listed_price: number | string | null;
  status: string;
  unit_type: string | null;
  unit_sub_type: string | null;
  usage_type: string | null;
  building_id: string;
  project_id: string;
}

interface BuildingRef {
  id: string;
  name: string;
}

interface ProjectRef {
  id: string;
  name: string;
}

interface SalesOrderRow {
  id: string;
  so_number: string;
  order_date: string;
  status: string;
  total: number | string;
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  invoice_date: string;
  status: string;
  total: number | string;
  balance_due: number | string;
}

interface ReceiptRow {
  id: string;
  payment_number: string;
  payment_date: string;
  amount: number | string;
  status: string;
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm text-ink-700">{value || "-"}</p>
    </div>
  );
}

function UnitStatusPill({ status }: { status: string }) {
  const tone =
    {
      sold: "bg-green-50 text-green-700",
      available: "bg-blue-50 text-blue-700",
      reserved: "bg-amber-50 text-amber-700",
      cancelled: "bg-red-50 text-red-700",
    }[status] ?? "bg-gray-100 text-gray-600";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{titleCase(status)}</span>;
}

function txnStatusTone(status: string): "green" | "gray" | "amber" | "red" | "blue" {
  if (["paid", "closed"].includes(status)) return "green";
  if (["void", "overdue"].includes(status)) return "red";
  if (["draft"].includes(status)) return "gray";
  if (["partially_paid", "sent", "open"].includes(status)) return "amber";
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

export default async function UnitDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireActiveContext();
  await requireModuleAccess(ctx, "inventory", "view");

  const unit = await queryOne<UnitRow>(
    `SELECT id, name, code, floor, area, listed_price, status, unit_type, unit_sub_type, usage_type, building_id, project_id
     FROM inventory WHERE id = $1 AND organization_id = $2`,
    [params.id, ctx.orgId]
  );
  if (!unit) notFound();

  const [building, project, salesOrders, invoices, receipts, org] = await Promise.all([
    unit.building_id
      ? queryOne<BuildingRef>(`SELECT id, name FROM buildings WHERE id = $1 AND organization_id = $2`, [unit.building_id, ctx.orgId])
      : Promise.resolve(null),
    unit.project_id
      ? queryOne<ProjectRef>(`SELECT id, name FROM projects WHERE id = $1 AND organization_id = $2`, [unit.project_id, ctx.orgId])
      : Promise.resolve(null),
    query<SalesOrderRow>(
      `SELECT id, so_number, order_date, status, total
       FROM sales_orders WHERE unit_id = $1 AND organization_id = $2
       ORDER BY order_date DESC`,
      [params.id, ctx.orgId]
    ),
    query<InvoiceRow>(
      `SELECT id, invoice_number, invoice_date, status, total, balance_due
       FROM invoices WHERE unit_id = $1 AND organization_id = $2
       ORDER BY invoice_date DESC`,
      [params.id, ctx.orgId]
    ),
    query<ReceiptRow>(
      `SELECT id, payment_number, payment_date, amount, status
       FROM payments_received WHERE unit_id = $1 AND organization_id = $2
       ORDER BY payment_date DESC`,
      [params.id, ctx.orgId]
    ),
    queryOne<{ currency: string }>(`SELECT currency FROM organizations WHERE id = $1`, [ctx.orgId]),
  ]);
  const currency = org?.currency ?? "AED";

  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/inventory" className="mb-2 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600">
          <ChevronLeft size={12} /> Units
        </Link>
        <div className="flex items-center justify-between">
          <div>
            {(building || project) && (
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                {project && (
                  <Link href={`/projects/${project.id}`} className="hover:text-brand-600 hover:underline">
                    {project.name}
                  </Link>
                )}
                {project && building && " / "}
                {building && (
                  <Link href={`/buildings/${building.id}`} className="hover:text-brand-600 hover:underline">
                    {building.name}
                  </Link>
                )}
              </p>
            )}
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-ink-800">{unit.name}</h1>
              <UnitStatusPill status={unit.status} />
            </div>
          </div>
          <Link href={`/inventory/${unit.id}/edit`} className="btn-secondary">
            <Pencil size={14} /> Edit
          </Link>
        </div>
      </div>

      <div className="space-y-6 p-6">
        <div className="card p-6">
          <h2 className="mb-4 text-sm font-semibold text-ink-800">Unit Details</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Project" value={project?.name ?? null} />
            <Field label="Building" value={building?.name ?? null} />
            <Field label="Code" value={unit.code} />
            <Field label="Floor" value={unit.floor} />
            <Field label="Area" value={unit.area != null ? String(unit.area) : null} />
            <Field label="Listed Price" value={formatCurrency(unit.listed_price, currency)} />
            <Field label="Unit Type" value={unit.unit_type ? titleCase(unit.unit_type) : null} />
            <Field label="Unit Sub Type" value={unit.unit_sub_type ? unit.unit_sub_type.toUpperCase() : null} />
            <Field label="Usage Type" value={unit.usage_type ? titleCase(unit.usage_type) : null} />
          </div>
        </div>

        <div className="card p-0">
          <div className="border-b border-gray-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-ink-800">Sales Orders ({salesOrders.length})</h2>
          </div>
          {salesOrders.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-400">No sales orders for this unit yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-5 py-2">Sales Order #</th>
                    <th className="px-5 py-2">Date</th>
                    <th className="px-5 py-2 text-right">Total</th>
                    <th className="px-5 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {salesOrders.map((so) => (
                    <tr key={so.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-5 py-2.5">
                        <Link href={`/sales-orders/${so.id}`} className="font-medium text-brand-600 hover:underline">
                          {so.so_number}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-ink-700">{formatDate(so.order_date)}</td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-right text-ink-800">{formatCurrency(so.total, currency)}</td>
                      <td className="whitespace-nowrap px-5 py-2.5">
                        <StatusPill label={titleCase(so.status)} tone={txnStatusTone(so.status)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card p-0">
          <div className="border-b border-gray-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-ink-800">Invoices ({invoices.length})</h2>
          </div>
          {invoices.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-400">No invoices for this unit yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-5 py-2">Invoice #</th>
                    <th className="px-5 py-2">Date</th>
                    <th className="px-5 py-2 text-right">Total</th>
                    <th className="px-5 py-2 text-right">Balance Due</th>
                    <th className="px-5 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-5 py-2.5">
                        <Link href={`/invoices/${inv.id}`} className="font-medium text-brand-600 hover:underline">
                          {inv.invoice_number}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-ink-700">{formatDate(inv.invoice_date)}</td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-right text-ink-800">{formatCurrency(inv.total, currency)}</td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-right text-ink-800">{formatCurrency(inv.balance_due, currency)}</td>
                      <td className="whitespace-nowrap px-5 py-2.5">
                        <StatusPill label={titleCase(inv.status)} tone={txnStatusTone(inv.status)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card p-0">
          <div className="border-b border-gray-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-ink-800">Receipts ({receipts.length})</h2>
          </div>
          {receipts.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-400">No receipts for this unit yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-5 py-2">Payment #</th>
                    <th className="px-5 py-2">Date</th>
                    <th className="px-5 py-2 text-right">Amount</th>
                    <th className="px-5 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {receipts.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-5 py-2.5">
                        <Link href={`/payments-received/${r.id}`} className="font-medium text-brand-600 hover:underline">
                          {r.payment_number}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-ink-700">{formatDate(r.payment_date)}</td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-right text-ink-800">{formatCurrency(r.amount, currency)}</td>
                      <td className="whitespace-nowrap px-5 py-2.5">
                        <StatusPill label={titleCase(r.status)} tone={txnStatusTone(r.status)} />
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
  );
}
