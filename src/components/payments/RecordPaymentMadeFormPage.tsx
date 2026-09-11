import { query, queryOne } from "@/lib/db";
import { requireActiveContext } from "@/lib/session";
import { getOrCreateNumberSeries, formatSeriesNumber } from "@/lib/number-series";
import RecordPaymentMadeForm from "@/components/payments/RecordPaymentMadeForm";

/** Server-component wrapper for RecordPaymentMadeForm — the vendor-side mirror of
 * RecordPaymentFormPage.tsx. */
export default async function RecordPaymentMadeFormPage() {
  const ctx = await requireActiveContext();

  const [vendors, bankAccounts, org, series] = await Promise.all([
    query<{ id: string; display_name: string; company_name: string | null }>(
      `SELECT id, display_name, company_name FROM vendors WHERE organization_id = $1 AND is_active = true ORDER BY display_name ASC`,
      [ctx.orgId]
    ),
    query<{ id: string; account_name: string; is_primary: boolean }>(
      `SELECT id, account_name, is_primary FROM bank_accounts WHERE organization_id = $1 ORDER BY is_primary DESC, account_name ASC`,
      [ctx.orgId]
    ),
    queryOne<{ currency: string }>(`SELECT currency FROM organizations WHERE id = $1`, [ctx.orgId]),
    getOrCreateNumberSeries(ctx.orgId, "payments-made"),
  ]);

  return (
    <RecordPaymentMadeForm
      vendorOptions={vendors.map((v) => ({
        value: v.id,
        label: v.company_name ? `${v.display_name} (${v.company_name})` : v.display_name,
      }))}
      bankAccountOptions={bankAccounts.map((b) => ({ value: b.id, label: b.account_name }))}
      currency={org?.currency ?? "AED"}
      numberPreview={series.mode === "auto" ? formatSeriesNumber(series) : undefined}
    />
  );
}
