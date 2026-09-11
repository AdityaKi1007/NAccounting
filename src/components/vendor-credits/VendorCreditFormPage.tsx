import { notFound } from "next/navigation";
import { query, queryOne } from "@/lib/db";
import { getOrCreateNumberSeries } from "@/lib/number-series";
import { requireActiveContext } from "@/lib/session";
import PageHeader from "@/components/crud/PageHeader";
import VendorCreditForm, { type VendorCreditOption, type VendorCreditItemOption } from "@/components/vendor-credits/VendorCreditForm";

/** Bespoke create/edit page for Vendor Credits — mirrors BillFormPage.tsx's shape exactly. */
export default async function VendorCreditFormPage({ id }: { id?: string }) {
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
    getOrCreateNumberSeries(ctx.orgId, "vendor-credits"),
    queryOne<{ currency: string }>(`SELECT currency FROM organizations WHERE id = $1`, [ctx.orgId]),
  ]);

  const vendorOptions: VendorCreditOption[] = vendorRows.map((r) => ({ value: r.id, label: r.display_name }));
  const accountOptions: VendorCreditOption[] = accountRows.map((r) => ({ value: r.id, label: r.code ? `${r.code} - ${r.name}` : r.name }));
  const apAccountOptions: VendorCreditOption[] = apAccountRows.map((r) => ({ value: r.id, label: r.code ? `${r.code} - ${r.name}` : r.name }));
  const itemOptions: VendorCreditItemOption[] = itemRows.map((r) => ({ value: r.id, label: r.name, purchasePrice: Number(r.purchase_price) }));
  const taxRateOptions = taxRateRows.map((r) => ({ value: r.id, label: r.name, rate: Number(r.rate) }));
  const customerOptions: VendorCreditOption[] = customerRows.map((r) => ({ value: r.id, label: r.display_name }));

  let initial: { header: Record<string, unknown>; lines: Record<string, unknown>[] } | null = null;
  if (id) {
    const header = await queryOne<Record<string, unknown>>(`SELECT * FROM vendor_credits WHERE id = $1 AND organization_id = $2`, [
      id,
      ctx.orgId,
    ]);
    if (!header) notFound();
    const lines = await query<Record<string, unknown>>(`SELECT * FROM vendor_credit_items WHERE vendor_credit_id = $1 ORDER BY id`, [id]);
    initial = { header, lines };
  }

  return (
    <div>
      <PageHeader title={id ? "Edit Vendor Credit" : "New Vendor Credit"} />
      <div className="m-6 max-w-4xl">
        <VendorCreditForm
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
