import { notFound } from "next/navigation";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";
import { query, queryOne } from "@/lib/db";
import { processDueJournalReversals } from "@/lib/journal-reversals";
import JournalDetailView from "@/components/accounting/JournalDetailView";

interface JournalRow {
  id: string;
  journal_number: string;
  journal_date: string;
  reference_number: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  reporting_method: string;
  currency_code: string | null;
  reverse_journal_date: string | null;
  reverse_only_on_date: boolean;
  reversed_journal_id: string | null;
}

interface LineRow {
  account_name: string | null;
  description: string | null;
  debit: string;
  credit: string;
  contact_name: string | null;
}

interface LinkedJournalRow {
  id: string;
  journal_number: string;
  journal_date: string;
  status: string;
}

export default async function ManualJournalDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireActiveContext();
  await requireModuleAccess(ctx, "manual-journals", "view");

  // Lazily auto-publishes any reversing journal whose reverse date has arrived (see
  // src/lib/journal-reversals.ts) — this app has no cron runner, so a visit to a journal's
  // own detail page is one of the few places that check can happen.
  await processDueJournalReversals(ctx.orgId);

  const journal = await queryOne<JournalRow>(
    `SELECT id, journal_number, journal_date, reference_number, notes, status, created_at,
            reporting_method, currency_code, reverse_journal_date, reverse_only_on_date, reversed_journal_id
     FROM manual_journals WHERE id = $1 AND organization_id = $2`,
    [params.id, ctx.orgId]
  );
  if (!journal) notFound();

  const [lines, org, reversalOf, reversalFor] = await Promise.all([
    query<LineRow>(
      `SELECT a.name AS account_name, jl.description, jl.debit, jl.credit,
              COALESCE(c.display_name, v.display_name) AS contact_name
       FROM journal_lines jl
       LEFT JOIN accounts a ON a.id = jl.account_id
       LEFT JOIN customers c ON jl.contact_type = 'customer' AND jl.contact_id = c.id
       LEFT JOIN vendors v ON jl.contact_type = 'vendor' AND jl.contact_id = v.id
       WHERE jl.journal_id = $1
       ORDER BY jl.id ASC`,
      [journal.id]
    ),
    queryOne<{ currency: string }>(`SELECT currency FROM organizations WHERE id = $1`, [ctx.orgId]),
    // If this journal IS a reversal, the journal it reverses.
    journal.reversed_journal_id
      ? queryOne<LinkedJournalRow>(
          `SELECT id, journal_number, journal_date, status FROM manual_journals WHERE id = $1 AND organization_id = $2`,
          [journal.reversed_journal_id, ctx.orgId]
        )
      : Promise.resolve(null),
    // If this journal HAS a reversal, that reversing journal.
    queryOne<LinkedJournalRow>(
      `SELECT id, journal_number, journal_date, status FROM manual_journals WHERE reversed_journal_id = $1 AND organization_id = $2`,
      [journal.id, ctx.orgId]
    ),
  ]);

  return (
    <JournalDetailView
      journal={{
        id: journal.id,
        number: journal.journal_number,
        date: journal.journal_date,
        referenceNumber: journal.reference_number,
        notes: journal.notes,
        status: journal.status,
        createdAt: journal.created_at,
        reportingMethod: journal.reporting_method,
        reverseJournalDate: journal.reverse_journal_date,
        reverseOnlyOnDate: journal.reverse_only_on_date,
        isReversal: !!journal.reversed_journal_id,
      }}
      currency={journal.currency_code || org?.currency || "AED"}
      lines={lines.map((l) => ({
        accountName: l.account_name ?? "-",
        description: l.description,
        contactName: l.contact_name,
        debit: Number(l.debit),
        credit: Number(l.credit),
      }))}
      reversalOf={reversalOf}
      reversalFor={reversalFor}
    />
  );
}
