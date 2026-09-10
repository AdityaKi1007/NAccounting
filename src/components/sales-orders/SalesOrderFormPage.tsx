import { notFound } from "next/navigation";
import { query, queryOne } from "@/lib/db";
import { requireActiveContext } from "@/lib/session";
import { documentConfigs } from "@/lib/documents";
import { getOrCreateNumberSeries, formatSeriesNumber } from "@/lib/number-series";
import PageHeader from "@/components/crud/PageHeader";
import SalesOrderForm from "@/components/sales-orders/SalesOrderForm";

const cfg = documentConfigs["sales-orders"];

export default async function SalesOrderFormPage({ id }: { id?: string }) {
  const ctx = await requireActiveContext();

  const [customerRows, itemRows, paymentTermRows, org, series] = await Promise.all([
    query<{ id: string; display_name: string; company_name: string | null }>(
      `SELECT id, display_name, company_name FROM customers WHERE organization_id = $1 AND is_active = true ORDER BY display_name ASC`,
      [ctx.orgId]
    ),
    query<{ id: string; name: string; sales_price: number }>(
      `SELECT id, name, sales_price FROM items WHERE organization_id = $1 ORDER BY name ASC`,
      [ctx.orgId]
    ),
    query<{ name: string; is_default: boolean }>(
      `SELECT name, is_default FROM payment_terms WHERE organization_id = $1 AND is_active = true ORDER BY is_default DESC, name ASC`,
      [ctx.orgId]
    ),
    queryOne<{ currency: string }>(`SELECT currency FROM organizations WHERE id = $1`, [ctx.orgId]),
    getOrCreateNumberSeries(ctx.orgId, "sales-orders"),
  ]);

  let initial = null;
  if (id) {
    const header = await queryOne<Record<string, unknown>>(
      `SELECT * FROM ${cfg.headerTable} WHERE organization_id = $1 AND id = $2`,
      [ctx.orgId, id]
    );
    if (!header) notFound();
    const lines = await query<{
      item_id: string | null;
      description: string | null;
      quantity: number;
      rate: number;
      discount_percent: number;
    }>(
      `SELECT item_id, description, quantity, rate, discount_percent FROM ${cfg.itemsTable} WHERE ${cfg.parentField} = $1 ORDER BY id`,
      [id]
    );
    initial = { header, lines };
  }

  return (
    <div>
      <PageHeader
        title={id ? "Edit Sales Order" : "New Sales Order"}
        subtitle={id ? undefined : "Create a new sales order"}
      />
      <div className="m-6 card max-w-4xl p-6">
        <SalesOrderForm
          customerOptions={customerRows.map((c) => ({
            value: c.id,
            label: c.company_name ? `${c.display_name} (${c.company_name})` : c.display_name,
          }))}
          itemOptions={itemRows.map((r) => ({ value: r.id, label: r.name, salesPrice: Number(r.sales_price ?? 0) }))}
          paymentTermOptions={paymentTermRows.map((t) => t.name)}
          defaultPaymentTerm={paymentTermRows.find((t) => t.is_default)?.name ?? paymentTermRows[0]?.name ?? "Due on Receipt"}
          currency={org?.currency ?? "AED"}
          initial={initial}
          recordId={id}
          numberPreview={id ? undefined : formatSeriesNumber(series)}
        />
      </div>
    </div>
  );
}
