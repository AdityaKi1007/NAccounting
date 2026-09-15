import type { PoolClient } from "pg";
import { pool, queryOne, query } from "@/lib/db";
import { claimNextNumber } from "@/lib/number-series";
import { getOrCreateBankGLAccount } from "@/lib/auto-journal";
import { recordAuditLog } from "@/lib/audit-log";

// Backs the "Imported Transactions" staging list — see the Banks -> "Import Statement" wizard
// (statement-import.ts does the file parsing) and /banking/imports (the review/categorize/post
// UI). Rows land here with status='pending' and nothing touches the GL until a human picks a
// Chart of Accounts category and posts it (postImportedTransaction below), which is a plain
// two-line manual journal — the same manual_journals/journal_lines tables every other
// auto-posted document in this app already uses, just created directly here rather than
// through the generic entities API (there's no "form" for this, the wizard IS the form).

export interface NormalizedTransaction {
  txnDate: string; // ISO YYYY-MM-DD
  description: string;
  reference: string | null;
  amount: number; // always positive
  direction: "in" | "out";
}

export interface ImportedTransactionRow {
  id: string;
  organization_id: string;
  import_id: string;
  bank_account_id: string;
  txn_date: string;
  description: string;
  reference: string | null;
  amount: string;
  direction: "in" | "out";
  status: "pending" | "posted" | "ignored";
  category_account_id: string | null;
  journal_id: string | null;
  created_at: string;
}

export async function createImportBatch(
  orgId: string,
  bankAccountId: string,
  fileName: string | null,
  fileFormat: string,
  transactions: NormalizedTransaction[],
  userId: string | null
): Promise<{ importId: string; count: number }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batch = await client.query<{ id: string }>(
      `INSERT INTO bank_statement_imports (organization_id, bank_account_id, file_name, file_format, total_rows, imported_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [orgId, bankAccountId, fileName, fileFormat, transactions.length, userId]
    );
    const importId = batch.rows[0].id;

    for (const t of transactions) {
      await client.query(
        `INSERT INTO imported_bank_transactions
           (organization_id, import_id, bank_account_id, txn_date, description, reference, amount, direction, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')`,
        [orgId, importId, bankAccountId, t.txnDate, t.description, t.reference, t.amount, t.direction]
      );
    }
    await client.query("COMMIT");
    return { importId, count: transactions.length };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Flags rows in `transactions` that already have a match in imported_bank_transactions for
 * the same bank account (same date + amount + direction) — surfaced as a non-blocking warning
 * in the Preview step so re-uploading the same statement (or an overlapping date range) twice
 * doesn't silently double an import; the user still decides row by row. */
export async function findDuplicateFlags(
  orgId: string,
  bankAccountId: string,
  transactions: NormalizedTransaction[]
): Promise<boolean[]> {
  if (transactions.length === 0) return [];
  // Cast txn_date to text in SQL (rather than via JS Date.toString()/slice) — node-pg parses a
  // `date` column into a JS Date using the LOCAL server timezone, which can shift the
  // calendar date by a day depending on the server's TZ; a Postgres-side ::text cast always
  // returns the stored "YYYY-MM-DD" verbatim, with no such ambiguity.
  const existing = await query<{ txn_date: string; amount: string; direction: string }>(
    `SELECT txn_date::text AS txn_date, amount, direction FROM imported_bank_transactions
     WHERE organization_id = $1 AND bank_account_id = $2 AND status != 'ignored'`,
    [orgId, bankAccountId]
  );
  const seen = new Set(existing.map((r) => `${r.txn_date}|${Number(r.amount).toFixed(2)}|${r.direction}`));
  return transactions.map((t) => seen.has(`${t.txnDate}|${t.amount.toFixed(2)}|${t.direction}`));
}

export async function postImportedTransaction(
  orgId: string,
  id: string,
  categoryAccountId: string,
  actor: { userId?: string }
): Promise<{ ok: true; journalId: string } | { ok: false; error: string; status?: number }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Same node-pg date-parsing gotcha as findDuplicateFlags above: SELECT * would hand back
    // txn_date as a JS Date object parsed in the server's local timezone, and that object would
    // then be re-serialized (via local-timezone getters, an asymmetry with the UTC-based read
    // path) into the manual_journals.journal_date insert below — risking an off-by-one-day
    // journal date depending on the container's TZ. Re-selecting txn_date::text after the
    // wildcard overrides that one field with the verbatim "YYYY-MM-DD" string (node-pg builds
    // each row object by assigning fields in order, so a later duplicate name wins), leaving
    // every other column from SELECT * untouched.
    const rowResult = await client.query<ImportedTransactionRow>(
      `SELECT *, txn_date::text AS txn_date FROM imported_bank_transactions WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [id, orgId]
    );
    if (!rowResult.rowCount) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Not found", status: 404 };
    }
    const row = rowResult.rows[0];
    if (row.status !== "pending") {
      await client.query("ROLLBACK");
      return { ok: false, error: `This transaction is already ${row.status}.`, status: 400 };
    }

    const category = await client.query<{ id: string }>(
      `SELECT id FROM accounts WHERE id = $1 AND organization_id = $2 AND is_active`,
      [categoryAccountId, orgId]
    );
    if (!category.rowCount) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Choose a valid, active category account.", status: 400 };
    }

    const bankGlAccountId = await getOrCreateBankGLAccount(client, orgId, row.bank_account_id);
    if (!bankGlAccountId) {
      await client.query("ROLLBACK");
      return { ok: false, error: "This bank account isn't linked to a Chart of Accounts entry yet.", status: 400 };
    }

    const amount = Math.round(Number(row.amount) * 100) / 100;
    const label = row.description || (row.direction === "in" ? "Imported deposit" : "Imported withdrawal");
    const journalNumber = await claimNextNumber(client, orgId, "manual-journals");

    const journal = await client.query<{ id: string }>(
      `INSERT INTO manual_journals (organization_id, journal_number, journal_date, reference_number, notes, status)
       VALUES ($1, $2, $3, $4, $5, 'published') RETURNING id`,
      [orgId, journalNumber, row.txn_date, row.reference, `Imported bank transaction — ${label}`]
    );
    const journalId = journal.rows[0].id;

    // "in" = money deposited into the bank: Debit the bank GL account, Credit the category.
    // "out" = money paid out of the bank: Debit the category, Credit the bank GL account.
    const bankLine = row.direction === "in" ? { debit: amount, credit: 0 } : { debit: 0, credit: amount };
    const categoryLine = row.direction === "in" ? { debit: 0, credit: amount } : { debit: amount, credit: 0 };

    await client.query(
      `INSERT INTO journal_lines (journal_id, account_id, description, debit, credit) VALUES
         ($1, $2, $3, $4, $5), ($1, $6, $3, $7, $8)`,
      [journalId, bankGlAccountId, label, bankLine.debit, bankLine.credit, categoryAccountId, categoryLine.debit, categoryLine.credit]
    );

    await client.query(
      `UPDATE imported_bank_transactions SET status = 'posted', category_account_id = $1, journal_id = $2 WHERE id = $3`,
      [categoryAccountId, journalId, id]
    );

    await client.query("COMMIT");

    // Fire-and-forget, run only after the journal itself is safely committed — recordAuditLog
    // uses its own pool connection (see audit-log.ts) and never throws on its own failure.
    await recordAuditLog({
      orgId,
      actor,
      action: "create",
      module: "manual-journals",
      entityId: journalId,
      entityLabel: journalNumber,
      oldData: null,
      newData: { source: "bank-statement-import", imported_transaction_id: id, amount, direction: row.direction },
    });

    return { ok: true, journalId };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function ignoreImportedTransaction(orgId: string, id: string): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const existing = await queryOne<{ status: string }>(
    `SELECT status FROM imported_bank_transactions WHERE id = $1 AND organization_id = $2`,
    [id, orgId]
  );
  if (!existing) return { ok: false, error: "Not found", status: 404 };
  if (existing.status !== "pending") return { ok: false, error: `This transaction is already ${existing.status}.`, status: 400 };
  await query(`UPDATE imported_bank_transactions SET status = 'ignored' WHERE id = $1 AND organization_id = $2`, [id, orgId]);
  return { ok: true };
}

export async function deleteImportedTransaction(orgId: string, id: string): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const existing = await queryOne<{ status: string }>(
    `SELECT status FROM imported_bank_transactions WHERE id = $1 AND organization_id = $2`,
    [id, orgId]
  );
  if (!existing) return { ok: false, error: "Not found", status: 404 };
  if (existing.status === "posted") return { ok: false, error: "A posted transaction can't be deleted — it already created a journal entry.", status: 400 };
  await query(`DELETE FROM imported_bank_transactions WHERE id = $1 AND organization_id = $2`, [id, orgId]);
  return { ok: true };
}
