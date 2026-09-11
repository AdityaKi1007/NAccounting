import { notFound } from "next/navigation";
import { query, queryOne } from "@/lib/db";
import { getOrCreateNumberSeries } from "@/lib/number-series";
import { requireActiveContext } from "@/lib/session";
import PageHeader from "@/components/crud/PageHeader";
import BillForm, { type BillOption, type BillItemOption } from "@/components/bills/BillForm";

/** Bespoke create/edit page for Bills — mirrors ExpenseFormPage.tsx's shape (a server
 * component that loads every dropdown's options plus the existing row, hands them to the
 * client form as plain props). Not the generic DocumentFormPage: see BillForm.tsx and
 * bills-api.ts for why (per-line account/tax/customer). */
export default async function BillFormPage({ id }: { id?: string }) {
  const ctx = await requireActiveContext();

  const [vendorRows, accountRows, apAccountRows, itemRows, taxRateRows, customerRows, series, org] = await Promise.all([
    query<{ id: string; display_name: string }>(
      `SELECT id, display_name FROM vendors WHERE organization_id = $1 ORDER BY display_name ASC`,
      [ctx.orgId]
    ),
    query<{ id: string; name: string; code: string | null }>(
      `SELECT id, name, code FROM accounts
       WHERE organization_id = $1 AND is_active AND type IN ('expense', 'cost_of_goods_sold', 'fixed_asset', 'other_asset')
       ORDER BY code NULLS LAST, name ASC`,
      [ctx.orgId]
    ),
    query<{ id: string; name: string; code: string | null }>(
      `SELECT id, name, code FROM accounts
       WHERE organization_id = $1 AND is_active AND type = 'accounts_payable'
       ORDER BY code NULLS LAST, name ASC`,
      [ctx.orgId]
    ),
    query<{ id: string; name: string; purchase_price: string }>(
      `SELECT id, name, purchase_price FROM items WHERE organization_id = $1 ORDER BY name ASC`,
      [ctx.orgId]
    ),
    query<{ id: string; name: string; rate: string }>(
      `SELECT id, name, rate FROM tax_rates WHERE organization_id = $1 ORDER BY created_at ASC`,
      [ctx.orgId]
    ),
    query<{ id: string; display_name: string }>(
      `SELECT id, display_name FROM customers WHERE organization_id = $1 ORDER BY display_name ASC`,
      [ctx.orgId]
    ),
    getOrCreateNumberSeries(ctx.orgId, "bills"),
    queryOne<{ currency: string }>(`SELECT currency FROM organizations WHERE id = $1`, [ctx.orgId]),
  ]);

  const vendorOptions: BillOption[] = vendorRows.map((r) => ({ value: r.id, label: r.display_name }));
  const accountOptions: BillOption[] = accountRows.map((r) => ({ value: r.id, label: r.code ? `${r.code} - ${r.name}` : r.name }));
  const apAccountOptions: BillOption[] = apAccountRows.map((r) => ({ value: r.id, label: r.code ? `${r.code} - ${r.name}` : r.name }));
  const itemOptions: BillItemOption[] = itemRows.map((r) => ({ value: r.id, label: r.name, purchasePrice: Number(r.purchase_price) }));
  const taxRateOptions = taxRateRows.map((r) => ({ value: r.id, label: r.name, rate: Number(r.rate) }));
  const customerOptions: BillOption[] = customerRows.map((r) => ({ value: r.id, label: r.display_name }));

  let initial: { header: Record<string, unknown>; lines: Record<string, unknown>[] } | null = null;
  if (id) {
    const header = await queryOne<Record<string, unknown>>(`SELECT * FROM bills WHERE id = $1 AND organization_id = $2`, [
      id,
      ctx.orgId,
    ]);
    if (!header) notFound();
    const lines = await query<Record<string, unknown>>(`SELECT * FROM bill_items WHERE bill_id = $1 ORDER BY id`, [id]);
    initial = { header, lines };
  }

  return (
    <div>
      <PageHeader title={id ? "Edit Bill" : "New Bill"} />
      <div className="m-6 max-w-4xl">
        <BillForm
          recordId={id}
          initial={initial}
          currency={org?.currency ?? "AED"}
          numberPreview={series.mode === "auto" ? `${series.prefix}${String(series.next_number).padStart(series.padding, "0")}` : undefined}
          vendorOptions={vendorOptions}
          accountOptions={accountOptions}
          apAccountOptions={apAccountOptions}
          itemOptions={itemOptions}
          taxRateOptions={taxRateOptions}
          customerOptions={customerOptions}
        />
      </div>
    </div>
  );
}
