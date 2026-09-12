import { notFound } from "next/navigation";
import { query, queryOne } from "@/lib/db";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";
import { documentConfigs } from "@/lib/documents";
import { getEntity } from "@/lib/entities";
import { getOrCreateNumberSeries } from "@/lib/number-series";
import PageHeader from "@/components/crud/PageHeader";
import DocumentForm from "@/components/crud/DocumentForm";

export default async function DocumentFormPage({ entityKey, id }: { entityKey: string; id?: string }) {
  const cfg = documentConfigs[entityKey];
  const entity = getEntity(entityKey);
  if (!cfg || !entity) notFound();

  const ctx = await requireActiveContext();
  await requireModuleAccess(ctx, entityKey, "write");

  // Property Master Project/Unit options — only Invoices' bespoke block in DocumentForm.tsx
  // renders these (see cfg.key === "invoices" there), so skip the two extra queries for
  // every other document type that shares this same page.
  const isInvoices = cfg.key === "invoices";

  const [partyRows, itemRows, projectRows, unitRows] = await Promise.all([
    query<{ id: string; label: string }>(
      `SELECT id, ${cfg.partyRefEntity === "customers" ? "display_name" : "display_name"} AS label
       FROM ${cfg.partyRefEntity} WHERE organization_id = $1 ORDER BY display_name ASC`,
      [ctx.orgId]
    ),
    query<{ id: string; name: string; sales_price: number; purchase_price: number }>(
      `SELECT id, name, sales_price, purchase_price FROM items WHERE organization_id = $1 ORDER BY name ASC`,
      [ctx.orgId]
    ),
    isInvoices
      ? query<{ id: string; name: string }>(`SELECT id, name FROM projects WHERE organization_id = $1 ORDER BY name ASC`, [ctx.orgId])
      : Promise.resolve([]),
    isInvoices
      ? query<{ id: string; name: string }>(`SELECT id, name FROM inventory WHERE organization_id = $1 ORDER BY name ASC`, [ctx.orgId])
      : Promise.resolve([]),
  ]);

  let initial = null;
  if (id) {
    const header = await queryOne(`SELECT * FROM ${cfg.headerTable} WHERE organization_id = $1 AND id = $2`, [
      ctx.orgId,
      id,
    ]);
    if (!header) notFound();
    const lines = await query<{ item_id: string | null; description: string | null; quantity: number; rate: number }>(
      `SELECT item_id, description, quantity, rate FROM ${cfg.itemsTable} WHERE ${cfg.parentField} = $1 ORDER BY id`,
      [id]
    );
    const subtotal = Number((header as Record<string, unknown>).subtotal ?? 0);
    const taxTotal = Number((header as Record<string, unknown>).tax_total ?? 0);
    initial = {
      header: header as Record<string, unknown>,
      lines,
      taxPercent: subtotal > 0 ? Math.round((taxTotal / subtotal) * 10000) / 100 : 5,
    };
  }

  const statusField = entity.fields.find((f) => f.name === "status");
  const numberSeries = cfg.numberSeriesKey ? await getOrCreateNumberSeries(ctx.orgId, cfg.numberSeriesKey) : null;

  return (
    <div>
      <PageHeader
        title={id ? `Edit ${entity.label}` : `New ${entity.label}`}
        subtitle={id ? undefined : `Create a new ${entity.label.toLowerCase()}`}
      />
      <div className="m-6 card max-w-4xl p-6">
        <DocumentForm
          cfg={cfg}
          partyOptions={partyRows.map((r) => ({ value: r.id, label: r.label }))}
          projectOptions={projectRows.map((r) => ({ value: r.id, label: r.name }))}
          unitOptions={unitRows.map((r) => ({ value: r.id, label: r.name }))}
          itemOptions={itemRows.map((r) => ({
            value: r.id,
            label: r.name,
            salesPrice: Number(r.sales_price ?? 0),
            purchasePrice: Number(r.purchase_price ?? 0),
          }))}
          statusOptions={statusField?.options ?? []}
          currency="AED"
          initial={initial}
          recordId={id}
          numberSeries={numberSeries}
          docLabel={entity.label}
        />
      </div>
    </div>
  );
}
