import { query, queryOne } from "@/lib/db";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";
import { getOrCreateNumberSeries, formatSeriesNumber } from "@/lib/number-series";
import RecordPaymentForm from "@/components/payments/RecordPaymentForm";

export default async function RecordPaymentFormPage() {
  const ctx = await requireActiveContext();
  await requireModuleAccess(ctx, "payments-received", "write");

  const [customers, bankAccounts, projects, units, org, series] = await Promise.all([
    query<{ id: string; display_name: string; company_name: string | null }>(
      `SELECT id, display_name, company_name FROM customers WHERE organization_id = $1 AND is_active = true ORDER BY display_name ASC`,
      [ctx.orgId]
    ),
    query<{ id: string; account_name: string; is_primary: boolean; project_id: string | null; gl_account_type: string | null }>(
      `SELECT ba.id, ba.account_name, ba.is_primary, ba.project_id, a.type AS gl_account_type
       FROM bank_accounts ba
       LEFT JOIN accounts a ON a.id = ba.gl_account_id
       WHERE ba.organization_id = $1
       ORDER BY ba.is_primary DESC, ba.account_name ASC`,
      [ctx.orgId]
    ),
    query<{ id: string; name: string }>(`SELECT id, name FROM projects WHERE organization_id = $1 ORDER BY name ASC`, [ctx.orgId]),
    query<{ id: string; name: string }>(`SELECT id, name FROM inventory WHERE organization_id = $1 ORDER BY name ASC`, [ctx.orgId]),
    queryOne<{ currency: string }>(`SELECT currency FROM organizations WHERE id = $1`, [ctx.orgId]),
    getOrCreateNumberSeries(ctx.orgId, "payments-received"),
  ]);

  return (
    <RecordPaymentForm
      customerOptions={customers.map((c) => ({
        value: c.id,
        label: c.company_name ? `${c.display_name} (${c.company_name})` : c.display_name,
      }))}
      bankAccountOptions={bankAccounts.map((b) => ({
        value: b.id,
        label: b.account_name,
        projectId: b.project_id,
        glAccountType: b.gl_account_type,
      }))}
      projectOptions={projects.map((p) => ({ value: p.id, label: p.name }))}
      unitOptions={units.map((u) => ({ value: u.id, label: u.name }))}
      currency={org?.currency ?? "AED"}
      // Left blank rather than pre-filled — see the same lesson applied to
      // SalesOrderForm.tsx/CreditDebitNoteForm.tsx: claimNextNumber() only advances the
      // series when the submitted number is empty, so pre-filling this with a concrete value
      // would resubmit it every time and the series counter would never move.
      numberPreview={series.mode === "auto" ? formatSeriesNumber(series) : undefined}
    />
  );
}
