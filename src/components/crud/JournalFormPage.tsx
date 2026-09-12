import { notFound } from "next/navigation";
import { query, queryOne } from "@/lib/db";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";
import { processDueJournalReversals } from "@/lib/journal-reversals";
import PageHeader from "@/components/crud/PageHeader";
import JournalForm from "@/components/crud/JournalForm";

export default async function JournalFormPage({ id }: { id?: string }) {
  const ctx = await requireActiveContext();
  await requireModuleAccess(ctx, "manual-journals", "write");

  // Lazily auto-publishes any reversing journal whose reverse date has arrived (see
  // src/lib/journal-reversals.ts) — this app has no cron runner, so a visit to any
  // journal-related page is one of the few places that check can happen.
  await processDueJournalReversals(ctx.orgId);

  const [accountRows, currencyRows, org, customerRows, vendorRows] = await Promise.all([
    query<{ id: string; name: string; code: string | null }>(
      `SELECT id, name, code FROM accounts WHERE organization_id = $1 AND is_active = true ORDER BY code ASC NULLS LAST, name ASC`,
      [ctx.orgId]
    ),
    query<{ code: string; name: string }>(
      `SELECT code, name FROM currencies WHERE organization_id = $1 ORDER BY code ASC`,
      [ctx.orgId]
    ),
    queryOne<{ currency: string }>(`SELECT currency FROM organizations WHERE id = $1`, [ctx.orgId]),
    query<{ id: string; display_name: string }>(
      `SELECT id, display_name FROM customers WHERE organization_id = $1 ORDER BY display_name ASC`,
      [ctx.orgId]
    ),
    query<{ id: string; display_name: string }>(
      `SELECT id, display_name FROM vendors WHERE organization_id = $1 ORDER BY display_name ASC`,
      [ctx.orgId]
    ),
  ]);

  const baseCurrency = org?.currency || "AED";
  // The org's base currency is always a valid choice even if it hasn't been added as its own
  // row in the Currencies settings list yet.
  const currencyOptions = currencyRows.some((c) => c.code === baseCurrency)
    ? currencyRows
    : [{ code: baseCurrency, name: baseCurrency }, ...currencyRows];

  let initial = null;
  let isReversal = false;
  if (id) {
    const header = await queryOne(`SELECT * FROM manual_journals WHERE organization_id = $1 AND id = $2`, [
      ctx.orgId,
      id,
    ]);
    if (!header) notFound();
    const lines = await query(`SELECT * FROM journal_lines WHERE journal_id = $1 ORDER BY id`, [id]);
    initial = { header: header as Record<string, unknown>, lines: lines as never[] };
    isReversal = Boolean((header as Record<string, unknown>).reversed_journal_id);
  }

  return (
    <div>
      <PageHeader title={id ? "Edit Manual Journal" : "New Journal"} />
      {isReversal && (
        <div className="mx-6 mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          This is an auto-generated reversing journal (see its Reference # for the original journal it reverses).
          Editing it directly is fine, but re-saving the original journal will resync this reversal back to a true
          mirror of it, overwriting any manual changes made here.
        </div>
      )}
      <div className="m-6 card max-w-5xl p-6">
        <JournalForm
          accountOptions={accountRows.map((r) => ({ value: r.id, label: r.code ? `${r.code} - ${r.name}` : r.name }))}
          contactOptions={{
            customers: customerRows.map((r) => ({ value: r.id, label: r.display_name })),
            vendors: vendorRows.map((r) => ({ value: r.id, label: r.display_name })),
          }}
          currencyOptions={currencyOptions.map((c) => ({ value: c.code, label: `${c.code} - ${c.name}` }))}
          baseCurrency={baseCurrency}
          initial={initial}
          recordId={id}
        />
      </div>
    </div>
  );
}
