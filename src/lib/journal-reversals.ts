import type { PoolClient } from "pg";
import { pool } from "@/lib/db";
import { claimNextNumber } from "@/lib/number-series";

// Keeps a manual journal's auto-generated *reversing* journal in sync with it — the
// "Reverse Journal Date" feature. Two design choices, spelled out because they're not
// obvious from the code alone:
//
//   - Unlike auto-journal.ts's replaceJournal (delete-then-recreate on every sync), this is
//     an UPSERT: if a reversal already exists for this journal, it's updated in place,
//     keeping its own id and journal_number stable. A reversal is a real, independently-
//     numbered document that shows up in the Manual Journals list on its own — re-numbering
//     it (which delete-then-recreate would do, by claiming a fresh number from the series
//     every time) every time the ORIGINAL is merely re-saved would be wrong and would burn
//     through the number series pointlessly. The invoice/payment/etc. auto-journals
//     replaceJournal manages don't have this problem because they aren't independently
//     browsable documents in their own right.
//   - The reversal's status depends on reverse_only_on_date: false (unchecked) means publish
//     it immediately, just dated on the reverse date — a normal, already-posted entry that
//     simply won't affect any report whose date range/as-of predates it, since every report
//     already filters by mj.journal_date. true (checked) means it starts life as Draft and
//     is auto-published only once that calendar date actually arrives — see
//     processDueJournalReversals below.

interface OriginalLine {
  account_id: string | null;
  description: string | null;
  debit: string | number;
  credit: string | number;
  contact_type: string | null;
  contact_id: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Creates/updates/removes the reversing journal for one manual journal, based on its current
 * status/reverse_journal_date/reverse_only_on_date. Call after every create/update of a
 * manual journal, inside the same transaction, right before COMMIT — mirrors how auto-
 * journal.ts's sync functions are called from inside the document save transaction. */
export async function syncJournalReversal(client: PoolClient, orgId: string, journalId: string) {
  const header = await client.query<{
    journal_number: string;
    journal_date: string;
    status: string;
    reverse_journal_date: string | null;
    reverse_only_on_date: boolean;
    reversed_journal_id: string | null;
  }>(
    `SELECT journal_number, journal_date, status, reverse_journal_date, reverse_only_on_date, reversed_journal_id
     FROM manual_journals WHERE id = $1 AND organization_id = $2`,
    [journalId, orgId]
  );
  if (!header.rowCount) return;
  const original = header.rows[0];

  // A reversal only ever reverses an original — never chain a reversal off another reversal.
  if (original.reversed_journal_id) return;

  const existing = await client.query<{ id: string }>(
    `SELECT id FROM manual_journals WHERE organization_id = $1 AND reversed_journal_id = $2`,
    [orgId, journalId]
  );
  const existingId = existing.rowCount ? existing.rows[0].id : null;

  const shouldReverse = original.status === "published" && !!original.reverse_journal_date;

  if (!shouldReverse) {
    if (existingId) {
      await client.query(`DELETE FROM manual_journals WHERE id = $1`, [existingId]);
    }
    return;
  }

  // ORDER BY id: without any ORDER BY, Postgres doesn't guarantee row order for this scan at
  // all -- repeated reads of the same journal could shuffle its lines on every call. This
  // isn't a guarantee of the ORIGINAL insertion order (journal_lines.id is gen_random_uuid(),
  // not a sequence, so id order ≠ entry order) -- no table in this app tracks a real line
  // position, invoice_items/credit_note_items/etc. all have the same limitation and are
  // ordered the same "ORDER BY id ASC" way throughout the codebase. What this DOES guarantee
  // is a stable, repeatable order matching every other line-item listing already uses, so a
  // reversal's lines read consistently next to the original's own (also id-ordered) listing,
  // rather than shuffling on every page load. The swapped debit/credit amounts are correct
  // either way -- this is a readability fix, not a correctness one.
  const lines = await client.query<OriginalLine>(
    `SELECT account_id, description, debit, credit, contact_type, contact_id
     FROM journal_lines WHERE journal_id = $1 ORDER BY id ASC`,
    [journalId]
  );
  const reversedLines = lines.rows
    .filter((l) => l.account_id)
    .map((l) => ({
      account_id: l.account_id as string,
      description: l.description,
      debit: round2(Number(l.credit)),
      credit: round2(Number(l.debit)),
      contact_type: l.contact_type,
      contact_id: l.contact_id,
    }));

  // Nothing sensible to reverse (e.g. every line lost its account since).
  if (reversedLines.length === 0) {
    if (existingId) {
      await client.query(`DELETE FROM manual_journals WHERE id = $1`, [existingId]);
    }
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const status = !original.reverse_only_on_date || original.reverse_journal_date! <= today ? "published" : "draft";
  const notes = `Reversal of Journal ${original.journal_number}, dated ${original.reverse_journal_date}`;

  let reversalId = existingId;
  if (!reversalId) {
    const number = await claimNextNumber(client, orgId, "manual-journals");
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO manual_journals
         (organization_id, journal_number, journal_date, reference_number, status, notes, reversed_journal_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [orgId, number, original.reverse_journal_date, original.journal_number, status, notes, journalId]
    );
    reversalId = inserted.rows[0].id;
  } else {
    await client.query(
      `UPDATE manual_journals SET journal_date = $1, reference_number = $2, status = $3, notes = $4 WHERE id = $5`,
      [original.reverse_journal_date, original.journal_number, status, notes, reversalId]
    );
    await client.query(`DELETE FROM journal_lines WHERE journal_id = $1`, [reversalId]);
  }

  for (const line of reversedLines) {
    await client.query(
      `INSERT INTO journal_lines (journal_id, account_id, description, debit, credit, contact_type, contact_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [reversalId, line.account_id, line.description, line.debit, line.credit, line.contact_type, line.contact_id]
    );
  }
}

/** Auto-publishes any reversing journal whose reverse date has arrived but which is still
 * sitting in Draft (the "Publish reverse journal only on the reverse journal date" case).
 * A cheap, idempotent, org-scoped UPDATE — safe to call on every read of the ledger. This app
 * has no cron/scheduled-job runner, so "on every read" (the manual journals list, a journal's
 * own page, and the three GL-driven reports) is how a date-triggered change like this gets
 * applied — call it before any of those read manual_journals/journal_lines. */
export async function processDueJournalReversals(orgId: string) {
  await pool.query(
    `UPDATE manual_journals
     SET status = 'published'
     WHERE organization_id = $1
       AND reversed_journal_id IS NOT NULL
       AND status = 'draft'
       AND journal_date <= CURRENT_DATE`,
    [orgId]
  );
}
