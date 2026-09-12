import { query } from "@/lib/db";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";
import PageHeader from "@/components/crud/PageHeader";
import CreditNoteEntryPicker from "@/components/credit-debit-notes/CreditNoteEntryPicker";

// The standalone "+ New" entry point on the Credit Notes list (see entities.ts's
// customNewHref for "credit-notes"). A credit note only ever exists against a specific
// invoice — it adjusts that invoice's balance_due and posts a GL journal in the same
// transaction (see CreditDebitNoteFormPage.tsx / credit-debit-notes-api.ts) — so unlike a
// normal "+ New" button this can't create a blank record; it first asks which customer,
// then which of that customer's eligible invoices, then hands off into the exact same
// per-invoice flow the invoice's own "..." menu already uses.
export default async function CreditNotesNewPage() {
  const ctx = await requireActiveContext();
  await requireModuleAccess(ctx, "credit-notes", "write");

  const customers = await query<{ id: string; display_name: string; company_name: string | null }>(
    `SELECT id, display_name, company_name FROM customers WHERE organization_id = $1 AND is_active = true ORDER BY display_name ASC`,
    [ctx.orgId]
  );

  return (
    <div>
      <PageHeader title="New Credit Note" subtitle="Pick the customer and invoice this credit note applies to" />
      <div className="m-6 card max-w-2xl p-6">
        <CreditNoteEntryPicker
          customerOptions={customers.map((c) => ({
            value: c.id,
            label: c.company_name ? `${c.display_name} (${c.company_name})` : c.display_name,
          }))}
        />
      </div>
    </div>
  );
}
