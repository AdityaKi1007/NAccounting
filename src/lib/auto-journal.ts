import type { PoolClient } from "pg";
import { pool } from "@/lib/db";
import { claimNextNumber } from "@/lib/number-series";

// Keeps the double-entry journal for an invoice or a payment in sync with that document,
// reusing manual_journals/journal_lines (see migrations/1758600000000_auto_journals.js for
// the invoice_id/payment_id link columns this relies on). Called from inside the same
// transaction that saves the invoice/payment, right before COMMIT, so the document and its
// journal always land together or not at all.
//
// Design choices, spelled out because they're not obvious from the code alone:
//   - Every sync is a full delete-then-recreate of that document's journal (never a partial
//     patch), keyed by invoice_id/payment_id. That's what makes it safe to call on every
//     save, in any order, any number of times — editing an invoice's lines, or flipping its
//     status back and forth, always leaves exactly the journal that status/amount combination
//     implies, never a stale leftover from a previous version.
//   - Account resolution never throws. If a required account (Accounts Receivable, an Income
//     account, the bank's GL account, ...) can't be found for the org, the sync quietly
//     removes any existing auto-journal for that document and posts nothing, rather than
//     failing the invoice/payment save itself or posting a journal that doesn't balance. A
//     document search finding no accounts to post against is treated as configuration the
//     user hasn't finished (e.g. they renamed/deleted a default account), not a bug to crash
//     on — but it does mean a broken Chart of Accounts silently means no journal, which is
//     worth knowing if books ever look short an entry.
//   - "published" is used for the journal status (manual_journals.status), not "draft" — an
//     auto-generated entry represents a transaction that has actually happened, not something
//     pending review, and readonly journal_lines are still safely a factual, cascade-deleted
//     record of the invoice/payment even if that document is edited again immediately after.

interface JournalLineInput {
  accountId: string;
  description: string;
  debit: number;
  credit: number;
}

async function findAccountId(
  client: PoolClient,
  orgId: string,
  { types, nameLike }: { types: string[]; nameLike?: string }
): Promise<string | null> {
  if (nameLike) {
    const preferred = await client.query<{ id: string }>(
      `SELECT id FROM accounts WHERE organization_id = $1 AND is_active AND type = ANY($2::text[]) AND name ILIKE $3
       ORDER BY code NULLS LAST LIMIT 1`,
      [orgId, types, `%${nameLike}%`]
    );
    if (preferred.rowCount) return preferred.rows[0].id;
  }
  const fallback = await client.query<{ id: string }>(
    `SELECT id FROM accounts WHERE organization_id = $1 AND is_active AND type = ANY($2::text[])
     ORDER BY code NULLS LAST LIMIT 1`,
    [orgId, types]
  );
  return fallback.rowCount ? fallback.rows[0].id : null;
}

/** The GL account "behind" a bank account, creating and linking one if it was never set —
 * covers bank accounts created before migrations/1758600000000_auto_journals.js, or (before
 * the Banking-list/GL-relation fix below) any bank account whose linking hadn't happened yet.
 * Exported so it can also be called EAGERLY right after a bank account is created/edited via
 * the generic entity routes (see bank-accounts handling in
 * src/app/api/entities/[entity]/route.ts and [id]/route.ts) — not just lazily, the first time
 * a payment/expense/refund needs to post against it. Calling this when gl_account_id is
 * already set (whether auto-created earlier, or explicitly linked by the user to an EXISTING
 * Chart of Accounts entry via the Banking module's "Link to Chart of Accounts" field — see
 * bank-accounts.gl_account_id in entities.ts) is always a safe no-op, so every call site can
 * call it unconditionally without checking first.
 *
 * The created account's detailed type matches the bank account's own account_type (bank vs.
 * credit_card) rather than always 'cash' as before this fix — accountCategory() maps both to
 * the same top-level category either way, so this only changes the type LABEL shown in Chart
 * of Accounts, never balance-sign/category logic; nothing else in this file filters an
 * account lookup by type: ["cash"], so the change is safe. */
export async function getOrCreateBankGLAccount(client: PoolClient, orgId: string, bankAccountId: string): Promise<string | null> {
  const bank = await client.query<{ id: string; account_name: string; account_type: string; gl_account_id: string | null }>(
    `SELECT id, account_name, account_type, gl_account_id FROM bank_accounts WHERE id = $1 AND organization_id = $2`,
    [bankAccountId, orgId]
  );
  if (!bank.rowCount) return null;
  const row = bank.rows[0];
  if (row.gl_account_id) return row.gl_account_id;

  const glType = row.account_type === "credit_card" ? "credit_card" : "bank";
  const created = await client.query<{ id: string }>(
    `INSERT INTO accounts (organization_id, name, type) VALUES ($1, $2, $3) RETURNING id`,
    [orgId, row.account_name, glType]
  );
  const glAccountId = created.rows[0].id;
  await client.query(`UPDATE bank_accounts SET gl_account_id = $1 WHERE id = $2`, [glAccountId, bankAccountId]);
  return glAccountId;
}

/** Deletes any existing auto-journal for the given invoice/payment/credit note/debit note
 * (cascades its lines), then — if `lines` is non-empty — posts a fresh one. Passing an empty
 * `lines` array is how callers remove a journal (e.g. an invoice moved to Draft/Void, or a
 * credit/debit note that's been voided) without duplicating the delete step at every call
 * site. Exactly one of invoiceId/paymentId/creditNoteId/debitNoteId identifies which
 * manual_journals link column this journal is keyed by. */
async function replaceJournal(
  client: PoolClient,
  {
    orgId,
    invoiceId,
    paymentId,
    creditNoteId,
    debitNoteId,
    billId,
    paymentMadeId,
    expenseId,
    vendorCreditId,
    paymentRefundId,
    journalNumber,
    journalDate,
    referenceNumber,
    notes,
    lines,
  }: {
    orgId: string;
    invoiceId?: string;
    paymentId?: string;
    creditNoteId?: string;
    debitNoteId?: string;
    billId?: string;
    paymentMadeId?: string;
    expenseId?: string;
    vendorCreditId?: string;
    paymentRefundId?: string;
    journalNumber: string;
    journalDate: string;
    referenceNumber: string;
    notes: string;
    lines: JournalLineInput[];
  }
) {
  const linkColumn = invoiceId
    ? "invoice_id"
    : paymentId
      ? "payment_id"
      : creditNoteId
        ? "credit_note_id"
        : debitNoteId
          ? "debit_note_id"
          : billId
            ? "bill_id"
            : paymentMadeId
              ? "payment_made_id"
              : expenseId
                ? "expense_id"
                : vendorCreditId
                  ? "vendor_credit_id"
                  : "payment_refund_id";
  const linkValue =
    invoiceId ?? paymentId ?? creditNoteId ?? debitNoteId ?? billId ?? paymentMadeId ?? expenseId ?? vendorCreditId ?? paymentRefundId;

  await client.query(`DELETE FROM manual_journals WHERE organization_id = $1 AND ${linkColumn} = $2`, [orgId, linkValue]);
  if (lines.length === 0) return;

  const header = await client.query<{ id: string }>(
    `INSERT INTO manual_journals
       (organization_id, journal_number, journal_date, reference_number, status, notes,
        invoice_id, payment_id, credit_note_id, debit_note_id, bill_id, payment_made_id, expense_id, vendor_credit_id,
        payment_refund_id)
     VALUES ($1, $2, $3, $4, 'published', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
    [
      orgId,
      journalNumber,
      journalDate,
      referenceNumber,
      notes,
      invoiceId ?? null,
      paymentId ?? null,
      creditNoteId ?? null,
      debitNoteId ?? null,
      billId ?? null,
      paymentMadeId ?? null,
      expenseId ?? null,
      vendorCreditId ?? null,
      paymentRefundId ?? null,
    ]
  );
  const journalId = header.rows[0].id;

  for (const line of lines) {
    await client.query(
      `INSERT INTO journal_lines (journal_id, account_id, description, debit, credit) VALUES ($1, $2, $3, $4, $5)`,
      [journalId, line.accountId, line.description, line.debit, line.credit]
    );
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------------------
// Revenue Recognition (Settings -> General -> Revenue Recognition — see
// migrations/1782000000000_revenue_recognition.js for the full design writeup). Lets an
// invoice line tagged with a "Straight-Line" rule and a service period defer its income:
// instead of the whole line amount posting to Income on the invoice date, it's spread evenly
// (by day count) across the service period and recognized a period at a time as each period's
// end date arrives, via processDueRevenueRecognition below — this app's usual "process due X
// on page load" convention (see processDueJournalReversals in journal-reversals.ts), since
// there's no cron here. A line with no rule, or one tagged "Immediate", behaves exactly as
// every invoice line did before this feature existed.
// ---------------------------------------------------------------------------------------

/** Splits `totalAmount` across calendar-month buckets spanning [startDate, endDate]
 * (inclusive, 'YYYY-MM-DD' strings), each bucket's share proportional to its own day count
 * relative to the whole period's day count. The LAST bucket absorbs whatever rounding
 * remainder is left over (totalAmount minus the sum of every earlier bucket's rounded share)
 * rather than being independently rounded, so the returned periods always sum to exactly
 * totalAmount — never a cent more or less, which matters because syncInvoiceJournal trusts
 * SUM(revenue_recognition_schedules.amount) to equal the tagged line's own amount exactly (see
 * that function's own comment on why the main journal's Deferred Revenue split is always
 * computed from the schedule, never independently from line data). */
function prorateStraightLineMonthly(
  startDate: string,
  endDate: string,
  totalAmount: number
): { start: string; end: string; amount: number }[] {
  const msPerDay = 86400000;
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const totalDays = Math.round((end.getTime() - start.getTime()) / msPerDay) + 1;
  if (totalDays <= 0) return [];

  const periods: { start: string; end: string; amount: number }[] = [];
  let cursor = start;
  while (cursor.getTime() <= end.getTime()) {
    // Last calendar day of cursor's month, in UTC — day 0 of the following month.
    const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    const bucketEnd = monthEnd.getTime() < end.getTime() ? monthEnd : end;
    const bucketDays = Math.round((bucketEnd.getTime() - cursor.getTime()) / msPerDay) + 1;
    periods.push({
      start: cursor.toISOString().slice(0, 10),
      end: bucketEnd.toISOString().slice(0, 10),
      amount: round2(totalAmount * (bucketDays / totalDays)),
    });
    cursor = new Date(bucketEnd.getTime() + msPerDay);
  }
  if (periods.length > 0) {
    const sumExceptLast = round2(periods.slice(0, -1).reduce((s, p) => s + p.amount, 0));
    periods[periods.length - 1].amount = round2(totalAmount - sumExceptLast);
  }
  return periods;
}

/** Rebuilds one invoice's revenue-recognition schedule (one row per tagged line per proration
 * period) from its CURRENT invoice_items — call after every invoice create/update, inside the
 * same transaction, before syncInvoiceJournal builds the main journal (it needs
 * SUM(schedule.amount) to know how much of the invoice to post as Deferred Revenue vs. Income).
 *
 * "Frozen" once any period has actually recognized (recognized_at IS NOT NULL): this function
 * then does nothing at all, leaving every row — recognized or not — exactly as it is, no
 * matter how the invoice is edited afterward. This is the guarantee that makes it safe to call
 * unconditionally on every save: without it, updateDocument's normal "delete every line, then
 * reinsert" edit flow (see documents-api.ts) would cascade-delete this invoice's schedule rows
 * the moment ANY line changed, silently losing the link to periods that already posted a real,
 * historical journal entry. Before that first recognition, though, every row is still
 * provisional — nothing has been posted for it yet — so a full delete-then-regenerate from
 * scratch (mirroring replaceJournal's own contract elsewhere in this file) is always safe.
 *
 * `active` is false for a Draft/Void invoice (or a zero-total one) — status.ts's caller
 * decides this, not this function, since it already has the invoice row loaded. An inactive
 * invoice has no real, posted revenue yet, so (while not frozen) its schedule is cleared
 * rather than regenerated — nothing should be "due" for recognition off a Draft invoice. */
export async function syncRevenueRecognitionSchedule(client: PoolClient, orgId: string, invoiceId: string, active: boolean) {
  const frozen = await client.query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM revenue_recognition_schedules
       WHERE organization_id = $1 AND invoice_id = $2 AND recognized_at IS NOT NULL
     ) AS exists`,
    [orgId, invoiceId]
  );
  if (frozen.rows[0]?.exists) return;

  await client.query(`DELETE FROM revenue_recognition_schedules WHERE organization_id = $1 AND invoice_id = $2`, [orgId, invoiceId]);
  if (!active) return;

  const items = await client.query<{
    id: string;
    amount: string;
    revenue_recognition_rule_id: string | null;
    service_start_date: string | null;
    service_end_date: string | null;
  }>(
    `SELECT id, amount, revenue_recognition_rule_id,
            to_char(service_start_date, 'YYYY-MM-DD') AS service_start_date,
            to_char(service_end_date, 'YYYY-MM-DD') AS service_end_date
     FROM invoice_items
     WHERE invoice_id = $1
       AND revenue_recognition_rule_id IS NOT NULL
       AND service_start_date IS NOT NULL
       AND service_end_date IS NOT NULL`,
    [invoiceId]
  );
  if (items.rowCount === 0) return;

  const ruleIds = [...new Set(items.rows.map((r) => r.revenue_recognition_rule_id!))];
  const rules = await client.query<{ id: string; method: string }>(
    `SELECT id, method FROM revenue_recognition_rules WHERE organization_id = $1 AND id = ANY($2::uuid[])`,
    [orgId, ruleIds]
  );
  const methodByRule = new Map(rules.rows.map((r) => [r.id, r.method]));

  for (const item of items.rows) {
    // Anything other than "straight_line" — "immediate", or a rule that's since been deleted/
    // renamed away (methodByRule.get returns undefined) — gets no schedule at all, same as an
    // untagged line: its full amount stays in syncInvoiceJournal's normal immediate Income line.
    if (methodByRule.get(item.revenue_recognition_rule_id!) !== "straight_line") continue;
    if (item.service_end_date! < item.service_start_date!) continue; // nonsensical period — treat as untagged rather than guess

    const periods = prorateStraightLineMonthly(item.service_start_date!, item.service_end_date!, round2(Number(item.amount)));
    for (const period of periods) {
      await client.query(
        `INSERT INTO revenue_recognition_schedules
           (organization_id, invoice_id, invoice_item_id, period_start, period_end, amount)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [orgId, invoiceId, item.id, period.start, period.end, period.amount]
      );
    }
  }
}

/** Auto-posts the recognition journal (Dr Deferred Revenue / Cr Income) for every schedule row
 * across the whole org whose period has come due (period_end <= today) and hasn't recognized
 * yet — this app's usual "process due X on page load" convention (see
 * processDueJournalReversals), called from the Dashboard alongside that function. Deliberately
 * does NOT set invoice_id on the journal it posts: manual_journals.invoice_id is the link
 * column syncInvoiceJournal's replaceJournal uses to find and delete-then-recreate "the"
 * invoice's own journal on every save — a recognition journal sharing that column would get
 * silently deleted the next time the invoice is merely re-saved. It's still fully traceable
 * back to its invoice via revenue_recognition_schedules.journal_id and its own reference
 * number (the invoice number) and notes.
 *
 * One transaction for the whole batch: if anything fails partway through, nothing is marked
 * recognized and nothing posted, so the next call (the next page load) safely retries
 * everything from scratch — same idempotent, safe-to-call-repeatedly contract as every other
 * sync in this file. */
export async function processDueRevenueRecognition(orgId: string) {
  const due = await pool.query<{
    id: string;
    invoice_id: string;
    invoice_number: string;
    period_start: string;
    period_end: string;
    amount: string;
  }>(
    `SELECT s.id, s.invoice_id, i.invoice_number,
            to_char(s.period_start, 'YYYY-MM-DD') AS period_start,
            to_char(s.period_end, 'YYYY-MM-DD') AS period_end,
            s.amount
     FROM revenue_recognition_schedules s
     JOIN invoices i ON i.id = s.invoice_id
     WHERE s.organization_id = $1 AND s.recognized_at IS NULL AND s.period_end <= CURRENT_DATE
     ORDER BY s.period_end ASC, s.id ASC`,
    [orgId]
  );
  if (due.rowCount === 0) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const [deferredAccountId, incomeAccountId] = await Promise.all([
      findAccountId(client, orgId, { types: ["other_current_liability"], nameLike: "deferred" }),
      findAccountId(client, orgId, { types: ["income", "other_income"], nameLike: "sales" }),
    ]);
    // Same "configuration isn't finished yet, post nothing" policy as every other account
    // resolution in this file — the due rows stay unrecognized (recognized_at still NULL) and
    // are simply picked up again next time this runs, once the Chart of Accounts has what it
    // needs, rather than posting an unbalanced entry or crashing the page that called this.
    if (!deferredAccountId || !incomeAccountId) {
      await client.query("ROLLBACK");
      return;
    }

    for (const row of due.rows) {
      const amount = round2(Number(row.amount));
      if (amount <= 0) {
        // Nothing to post (a zero-amount period, e.g. from rounding) — mark it recognized with
        // no journal so it isn't retried forever; journal_id simply stays null, which is fine,
        // that column exists precisely to be optional (see the migration's own comment).
        await client.query(`UPDATE revenue_recognition_schedules SET recognized_at = now() WHERE id = $1`, [row.id]);
        continue;
      }

      const journalNumber = await claimNextNumber(client, orgId, "manual-journals");
      const notes = `Auto-generated Revenue Recognition for Invoice ${row.invoice_number}, period ${row.period_start} to ${row.period_end}`;
      const header = await client.query<{ id: string }>(
        `INSERT INTO manual_journals (organization_id, journal_number, journal_date, reference_number, status, notes)
         VALUES ($1, $2, $3, $4, 'published', $5) RETURNING id`,
        [orgId, journalNumber, row.period_end, row.invoice_number, notes]
      );
      const journalId = header.rows[0].id;
      const description = `Revenue Recognition — Invoice ${row.invoice_number}`;
      await client.query(
        `INSERT INTO journal_lines (journal_id, account_id, description, debit, credit) VALUES ($1, $2, $3, $4, 0)`,
        [journalId, deferredAccountId, description, amount]
      );
      await client.query(
        `INSERT INTO journal_lines (journal_id, account_id, description, debit, credit) VALUES ($1, $2, $3, 0, $4)`,
        [journalId, incomeAccountId, description, amount]
      );
      await client.query(`UPDATE revenue_recognition_schedules SET recognized_at = now(), journal_id = $1 WHERE id = $2`, [
        journalId,
        row.id,
      ]);
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
  } finally {
    client.release();
  }
}

/** Syncs the auto-journal for one invoice to its current status/subtotal/tax_total/total.
 * Safe to call after any invoice create/update, and on every call regardless of whether a
 * journal already exists — it always ends up matching the invoice's current state exactly. */
export async function syncInvoiceJournal(client: PoolClient, orgId: string, invoiceId: string) {
  const invoice = await client.query<{
    invoice_number: string;
    invoice_date: string;
    status: string;
    subtotal: string;
    tax_total: string;
    total: string;
  }>(
    `SELECT invoice_number, invoice_date, status, subtotal, tax_total, total FROM invoices
     WHERE id = $1 AND organization_id = $2`,
    [invoiceId, orgId]
  );
  if (!invoice.rowCount) return;
  const inv = invoice.rows[0];

  // Keep the Revenue Recognition schedule current before anything else below reads it — it
  // needs to reflect this invoice's CURRENT lines (just saved) whether or not the invoice ends
  // up posting a main journal at all; "active" governs whether a Draft/Void invoice's
  // not-yet-frozen schedule is cleared instead of regenerated (see that function's own
  // comment) — it does not skip the call, since a frozen schedule must survive either way.
  const isActiveRevenue = inv.status !== "draft" && inv.status !== "void";
  await syncRevenueRecognitionSchedule(client, orgId, invoiceId, isActiveRevenue);

  // Void and Draft invoices aren't real, posted revenue yet — no journal for either.
  if (!isActiveRevenue) {
    await replaceJournal(client, {
      orgId,
      invoiceId,
      journalNumber: inv.invoice_number,
      journalDate: inv.invoice_date,
      referenceNumber: inv.invoice_number,
      notes: "",
      lines: [],
    });
    return;
  }

  const subtotal = round2(Number(inv.subtotal));
  const taxTotal = round2(Number(inv.tax_total));
  const total = round2(Number(inv.total));
  if (total <= 0) {
    await replaceJournal(client, {
      orgId,
      invoiceId,
      journalNumber: inv.invoice_number,
      journalDate: inv.invoice_date,
      referenceNumber: inv.invoice_number,
      notes: "",
      lines: [],
    });
    return;
  }

  // The portion of this invoice's subtotal that's deferred (tagged Straight-Line with a
  // service period) rather than recognized immediately — always read from the schedule this
  // function just synced above, never recomputed independently from line data, which is what
  // guarantees the main journal below and the schedule are always mutually consistent and
  // balanced (see syncRevenueRecognitionSchedule's own comment). Capped at subtotal as a
  // defensive floor only — a tagged line's own schedule rows always sum to exactly that line's
  // amount (see prorateStraightLineMonthly), so deferredTotal should never actually exceed the
  // sum of all lines.
  const deferredResult = await client.query<{ total: string | null }>(
    `SELECT SUM(amount) AS total FROM revenue_recognition_schedules WHERE organization_id = $1 AND invoice_id = $2`,
    [orgId, invoiceId]
  );
  const deferredTotal = Math.min(subtotal, round2(Number(deferredResult.rows[0]?.total ?? 0)));
  const immediateIncome = Math.max(0, round2(subtotal - deferredTotal));

  const [arAccountId, incomeAccountId, taxAccountId, deferredAccountId] = await Promise.all([
    findAccountId(client, orgId, { types: ["accounts_receivable"] }),
    // Only actually needed when some part of this invoice recognizes immediately — a fully-
    // deferred invoice (every line tagged Straight-Line) has nothing to post to Income yet.
    immediateIncome > 0 ? findAccountId(client, orgId, { types: ["income", "other_income"], nameLike: "sales" }) : Promise.resolve(null),
    taxTotal > 0 ? findAccountId(client, orgId, { types: ["other_current_liability"], nameLike: "vat" }) : Promise.resolve(null),
    deferredTotal > 0 ? findAccountId(client, orgId, { types: ["other_current_liability"], nameLike: "deferred" }) : Promise.resolve(null),
  ]);

  // Can't post a journal that won't balance — if the org's Chart of Accounts is missing
  // Accounts Receivable, an Income account this invoice actually needs, a VAT account this
  // invoice actually needs, or (for a partly/fully deferred invoice) a Deferred Revenue
  // account, skip posting rather than guess.
  if (
    !arAccountId ||
    (immediateIncome > 0 && !incomeAccountId) ||
    (taxTotal > 0 && !taxAccountId) ||
    (deferredTotal > 0 && !deferredAccountId)
  ) {
    await replaceJournal(client, {
      orgId,
      invoiceId,
      journalNumber: inv.invoice_number,
      journalDate: inv.invoice_date,
      referenceNumber: inv.invoice_number,
      notes: "",
      lines: [],
    });
    return;
  }

  const lines: JournalLineInput[] = [{ accountId: arAccountId, description: `Invoice ${inv.invoice_number}`, debit: total, credit: 0 }];
  if (immediateIncome > 0 && incomeAccountId) {
    lines.push({ accountId: incomeAccountId, description: `Invoice ${inv.invoice_number}`, debit: 0, credit: immediateIncome });
  }
  if (deferredTotal > 0 && deferredAccountId) {
    lines.push({
      accountId: deferredAccountId,
      description: `Invoice ${inv.invoice_number} — deferred revenue`,
      debit: 0,
      credit: deferredTotal,
    });
  }
  if (taxTotal > 0 && taxAccountId) {
    lines.push({ accountId: taxAccountId, description: `Invoice ${inv.invoice_number}`, debit: 0, credit: taxTotal });
  }

  await replaceJournal(client, {
    orgId,
    invoiceId,
    journalNumber: inv.invoice_number,
    journalDate: inv.invoice_date,
    referenceNumber: inv.invoice_number,
    notes: `Auto-generated from Invoice ${inv.invoice_number}`,
    lines,
  });
}

/** Syncs the auto-journal for one payment. Only a "paid" (not draft) payment gets a journal —
 * a draft payment doesn't touch invoice balances either, so there's nothing to post yet. */
export async function syncPaymentJournal(client: PoolClient, orgId: string, paymentId: string) {
  const payment = await client.query<{
    payment_number: string;
    payment_date: string;
    status: string;
    amount: string;
    bank_charges: string;
    bank_account_id: string | null;
  }>(
    `SELECT payment_number, payment_date, status, amount, bank_charges, bank_account_id FROM payments_received
     WHERE id = $1 AND organization_id = $2`,
    [paymentId, orgId]
  );
  if (!payment.rowCount) return;
  const pmt = payment.rows[0];

  if (pmt.status !== "paid" || !pmt.bank_account_id) {
    await replaceJournal(client, {
      orgId,
      paymentId,
      journalNumber: pmt.payment_number,
      journalDate: pmt.payment_date,
      referenceNumber: pmt.payment_number,
      notes: "",
      lines: [],
    });
    return;
  }

  const amount = round2(Number(pmt.amount));
  const bankCharges = round2(Number(pmt.bank_charges));
  if (amount <= 0) {
    await replaceJournal(client, {
      orgId,
      paymentId,
      journalNumber: pmt.payment_number,
      journalDate: pmt.payment_date,
      referenceNumber: pmt.payment_number,
      notes: "",
      lines: [],
    });
    return;
  }

  const allocatedResult = await client.query<{ total: string | null }>(
    `SELECT SUM(amount) AS total FROM payment_allocations WHERE payment_id = $1`,
    [paymentId]
  );
  const allocated = round2(Number(allocatedResult.rows[0]?.total ?? 0));
  const unapplied = round2(Math.max(0, amount - allocated));
  const netDeposit = round2(amount - bankCharges);

  const [bankAccountId, arAccountId, bankChargesAccountId, unearnedAccountId] = await Promise.all([
    getOrCreateBankGLAccount(client, orgId, pmt.bank_account_id),
    allocated > 0 ? findAccountId(client, orgId, { types: ["accounts_receivable"] }) : Promise.resolve(null),
    bankCharges > 0 ? findAccountId(client, orgId, { types: ["expense"], nameLike: "bank charge" }) : Promise.resolve(null),
    unapplied > 0 ? findAccountId(client, orgId, { types: ["other_current_liability"], nameLike: "unearned" }) : Promise.resolve(null),
  ]);

  if (
    !bankAccountId ||
    (allocated > 0 && !arAccountId) ||
    (bankCharges > 0 && !bankChargesAccountId) ||
    (unapplied > 0 && !unearnedAccountId)
  ) {
    await replaceJournal(client, {
      orgId,
      paymentId,
      journalNumber: pmt.payment_number,
      journalDate: pmt.payment_date,
      referenceNumber: pmt.payment_number,
      notes: "",
      lines: [],
    });
    return;
  }

  const lines: JournalLineInput[] = [];
  if (netDeposit > 0) {
    lines.push({ accountId: bankAccountId, description: `Payment ${pmt.payment_number}`, debit: netDeposit, credit: 0 });
  }
  if (bankCharges > 0 && bankChargesAccountId) {
    lines.push({ accountId: bankChargesAccountId, description: `Payment ${pmt.payment_number} — bank charges`, debit: bankCharges, credit: 0 });
  }
  if (allocated > 0 && arAccountId) {
    lines.push({ accountId: arAccountId, description: `Payment ${pmt.payment_number} applied`, debit: 0, credit: allocated });
  }
  if (unapplied > 0 && unearnedAccountId) {
    lines.push({ accountId: unearnedAccountId, description: `Payment ${pmt.payment_number} — unapplied`, debit: 0, credit: unapplied });
  }

  // Net deposit can legitimately be 0 or negative (bank charges >= amount received) leaving
  // no debit line at all — nothing sensible to post in that edge case.
  const totalDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
  const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
  if (lines.length === 0 || totalDebit !== totalCredit || totalDebit <= 0) {
    await replaceJournal(client, {
      orgId,
      paymentId,
      journalNumber: pmt.payment_number,
      journalDate: pmt.payment_date,
      referenceNumber: pmt.payment_number,
      notes: "",
      lines: [],
    });
    return;
  }

  await replaceJournal(client, {
    orgId,
    paymentId,
    journalNumber: pmt.payment_number,
    journalDate: pmt.payment_date,
    referenceNumber: pmt.payment_number,
    notes: `Auto-generated from Payment ${pmt.payment_number}`,
    lines,
  });
}

/** Syncs the auto-journal for one refund issued against a Paid Payment Received — see
 * payment_refunds (migration 1771000000000_payment_refunds.js) and the "Refund" action on
 * PaymentDetailView.tsx. A receipt can carry more than one refund over time (partial refunds),
 * each with its OWN journal keyed by payment_refund_id — unlike every other sync function
 * above, which replaces THE one journal for a whole document, this replaces just the one
 * journal for this one refund row, leaving any of the receipt's other refunds' journals alone.
 *
 * Reverses exactly the liability syncPaymentJournal posted for the receipt's own unapplied/
 * excess amount: that sync posts Cr Unearned Revenue for whatever part of a receipt wasn't
 * applied to an invoice (see its own `unapplied` handling above); refunding that money back to
 * the customer is the mirror image, Dr Unearned Revenue / Cr the bank/cash account the refund
 * is paid from, for the refund's amount. createPaymentRefund (payment-refunds-api.ts) is what
 * enforces the refund can never exceed the receipt's current excess, so this never has to
 * reason about that — it just posts what the row says. */
export async function syncPaymentRefundJournal(client: PoolClient, orgId: string, refundId: string) {
  const refundResult = await client.query<{
    payment_received_id: string;
    amount: string;
    refunded_on: string;
    from_account_id: string | null;
    reference_number: string | null;
  }>(
    `SELECT payment_received_id, amount, refunded_on, from_account_id, reference_number
     FROM payment_refunds WHERE id = $1 AND organization_id = $2`,
    [refundId, orgId]
  );
  if (!refundResult.rowCount) return;
  const refund = refundResult.rows[0];

  const bail = (journalDate: string, referenceNumber: string, journalNumber: string) =>
    replaceJournal(client, {
      orgId,
      paymentRefundId: refundId,
      journalNumber,
      journalDate,
      referenceNumber,
      notes: "",
      lines: [],
    });

  const paymentResult = await client.query<{ payment_number: string }>(
    `SELECT payment_number FROM payments_received WHERE id = $1 AND organization_id = $2`,
    [refund.payment_received_id, orgId]
  );
  const paymentNumber = paymentResult.rows[0]?.payment_number ?? "Refund";
  const referenceNumber = refund.reference_number || paymentNumber;

  const amount = round2(Number(refund.amount));
  if (amount <= 0 || !refund.from_account_id) return bail(refund.refunded_on, referenceNumber, paymentNumber);

  const [bankAccountId, unearnedAccountId] = await Promise.all([
    getOrCreateBankGLAccount(client, orgId, refund.from_account_id),
    findAccountId(client, orgId, { types: ["other_current_liability"], nameLike: "unearned" }),
  ]);
  if (!bankAccountId || !unearnedAccountId) return bail(refund.refunded_on, referenceNumber, paymentNumber);

  const lines: JournalLineInput[] = [
    { accountId: unearnedAccountId, description: `Refund against Payment ${paymentNumber}`, debit: amount, credit: 0 },
    { accountId: bankAccountId, description: `Refund against Payment ${paymentNumber}`, debit: 0, credit: amount },
  ];

  await replaceJournal(client, {
    orgId,
    paymentRefundId: refundId,
    journalNumber: paymentNumber,
    journalDate: refund.refunded_on,
    referenceNumber,
    notes: `Auto-generated refund against Payment ${paymentNumber}`,
    lines,
  });
}

/** Syncs the auto-journal for one credit note. A credit note reverses part of the revenue an
 * invoice already booked — it posts against the exact same accounts syncInvoiceJournal uses
 * (Accounts Receivable, the Sales income account, VAT Payable), just with debit/credit
 * flipped: Dr Income (and Dr VAT, if any) / Cr Accounts Receivable, for the credit note's
 * subtotal/tax/total. "void" posts nothing, same as an invoice's draft/void handling — see
 * the module-level comment for why account resolution never throws. */
export async function syncCreditNoteJournal(client: PoolClient, orgId: string, creditNoteId: string) {
  const note = await client.query<{
    credit_note_number: string;
    credit_note_date: string;
    status: string;
    subtotal: string;
    tax_total: string;
    total: string;
  }>(
    `SELECT credit_note_number, credit_note_date, status, subtotal, tax_total, total FROM credit_notes
     WHERE id = $1 AND organization_id = $2`,
    [creditNoteId, orgId]
  );
  if (!note.rowCount) return;
  const cn = note.rows[0];

  const subtotal = round2(Number(cn.subtotal));
  const taxTotal = round2(Number(cn.tax_total));
  const total = round2(Number(cn.total));

  if (cn.status === "void" || total <= 0) {
    await replaceJournal(client, {
      orgId,
      creditNoteId,
      journalNumber: cn.credit_note_number,
      journalDate: cn.credit_note_date,
      referenceNumber: cn.credit_note_number,
      notes: "",
      lines: [],
    });
    return;
  }

  const [arAccountId, incomeAccountId, taxAccountId] = await Promise.all([
    findAccountId(client, orgId, { types: ["accounts_receivable"] }),
    findAccountId(client, orgId, { types: ["income", "other_income"], nameLike: "sales" }),
    taxTotal > 0 ? findAccountId(client, orgId, { types: ["other_current_liability"], nameLike: "vat" }) : Promise.resolve(null),
  ]);

  if (!arAccountId || !incomeAccountId || (taxTotal > 0 && !taxAccountId)) {
    await replaceJournal(client, {
      orgId,
      creditNoteId,
      journalNumber: cn.credit_note_number,
      journalDate: cn.credit_note_date,
      referenceNumber: cn.credit_note_number,
      notes: "",
      lines: [],
    });
    return;
  }

  const lines: JournalLineInput[] = [
    { accountId: incomeAccountId, description: `Credit Note ${cn.credit_note_number}`, debit: subtotal, credit: 0 },
  ];
  if (taxTotal > 0 && taxAccountId) {
    lines.push({ accountId: taxAccountId, description: `Credit Note ${cn.credit_note_number}`, debit: taxTotal, credit: 0 });
  }
  lines.push({ accountId: arAccountId, description: `Credit Note ${cn.credit_note_number}`, debit: 0, credit: total });

  await replaceJournal(client, {
    orgId,
    creditNoteId,
    journalNumber: cn.credit_note_number,
    journalDate: cn.credit_note_date,
    referenceNumber: cn.credit_note_number,
    notes: `Auto-generated from Credit Note ${cn.credit_note_number}`,
    lines,
  });
}

/** Syncs the auto-journal for one debit note. A debit note is additional billing on top of
 * an already-posted invoice, so it posts in the SAME direction an invoice itself does: Dr
 * Accounts Receivable / Cr Income (and Cr VAT, if any), for the debit note's total/subtotal/
 * tax. "void" posts nothing. */
export async function syncDebitNoteJournal(client: PoolClient, orgId: string, debitNoteId: string) {
  const note = await client.query<{
    debit_note_number: string;
    debit_note_date: string;
    status: string;
    subtotal: string;
    tax_total: string;
    total: string;
  }>(
    `SELECT debit_note_number, debit_note_date, status, subtotal, tax_total, total FROM debit_notes
     WHERE id = $1 AND organization_id = $2`,
    [debitNoteId, orgId]
  );
  if (!note.rowCount) return;
  const dn = note.rows[0];

  const subtotal = round2(Number(dn.subtotal));
  const taxTotal = round2(Number(dn.tax_total));
  const total = round2(Number(dn.total));

  if (dn.status === "void" || total <= 0) {
    await replaceJournal(client, {
      orgId,
      debitNoteId,
      journalNumber: dn.debit_note_number,
      journalDate: dn.debit_note_date,
      referenceNumber: dn.debit_note_number,
      notes: "",
      lines: [],
    });
    return;
  }

  const [arAccountId, incomeAccountId, taxAccountId] = await Promise.all([
    findAccountId(client, orgId, { types: ["accounts_receivable"] }),
    findAccountId(client, orgId, { types: ["income", "other_income"], nameLike: "sales" }),
    taxTotal > 0 ? findAccountId(client, orgId, { types: ["other_current_liability"], nameLike: "vat" }) : Promise.resolve(null),
  ]);

  if (!arAccountId || !incomeAccountId || (taxTotal > 0 && !taxAccountId)) {
    await replaceJournal(client, {
      orgId,
      debitNoteId,
      journalNumber: dn.debit_note_number,
      journalDate: dn.debit_note_date,
      referenceNumber: dn.debit_note_number,
      notes: "",
      lines: [],
    });
    return;
  }

  const lines: JournalLineInput[] = [
    { accountId: arAccountId, description: `Debit Note ${dn.debit_note_number}`, debit: total, credit: 0 },
    { accountId: incomeAccountId, description: `Debit Note ${dn.debit_note_number}`, debit: 0, credit: subtotal },
  ];
  if (taxTotal > 0 && taxAccountId) {
    lines.push({ accountId: taxAccountId, description: `Debit Note ${dn.debit_note_number}`, debit: 0, credit: taxTotal });
  }

  await replaceJournal(client, {
    orgId,
    debitNoteId,
    journalNumber: dn.debit_note_number,
    journalDate: dn.debit_note_date,
    referenceNumber: dn.debit_note_number,
    notes: `Auto-generated from Debit Note ${dn.debit_note_number}`,
    lines,
  });
}

// ---------------------------------------------------------------------------------------
// Purchases side (Bills / Payments Made / Expenses / Vendor Credits) — added so the ledger
// has a complete double-entry picture. Before this, only the sales side (Invoices, Payments
// Received, Credit/Debit Notes) posted anything, which is why a Balance Sheet or Cash Flow
// Statement built earlier wouldn't have balanced: Accounts Payable and every expense account
// would have sat at zero regardless of what bills/expenses actually existed. Mirrors the
// sales-side functions above account-for-account, with roles reversed (Cr AP instead of Dr
// AR, expense accounts instead of income).
// ---------------------------------------------------------------------------------------

/** Syncs the auto-journal for one bill: Dr [purchase expense] + Dr [VAT Payable, if any] /
 * Cr Accounts Payable, for the bill's subtotal/tax/total — the exact mirror of
 * syncInvoiceJournal. Draft bills post nothing (nothing owed yet); Open/Overdue/Paid/
 * Partially Paid all post the same full-total journal, since paying a bill down is a
 * SEPARATE journal entry (see syncPaymentMadeJournal) rather than a change to this one. */
export async function syncBillJournal(client: PoolClient, orgId: string, billId: string) {
  const bill = await client.query<{
    bill_number: string;
    bill_date: string;
    status: string;
    subtotal: string;
    tax_total: string;
    total: string;
    accounts_payable_account_id: string | null;
  }>(
    `SELECT bill_number, bill_date, status, subtotal, tax_total, total, accounts_payable_account_id FROM bills
     WHERE id = $1 AND organization_id = $2`,
    [billId, orgId]
  );
  if (!bill.rowCount) return;
  const b = bill.rows[0];

  const bail = () =>
    replaceJournal(client, {
      orgId,
      billId,
      journalNumber: b.bill_number,
      journalDate: b.bill_date,
      referenceNumber: b.bill_number,
      notes: "",
      lines: [],
    });

  // "void" (see voidBill in bills-api.ts) reverses whatever this bill had posted, same as
  // "draft" never having posted anything in the first place — both are a full bail.
  if (b.status === "draft" || b.status === "void") return bail();

  const taxTotal = round2(Number(b.tax_total));
  const total = round2(Number(b.total));
  if (total <= 0) return bail();

  // Per-line accounts (see migrations/1761000000000_bills_payments_vendor_credits_gl.js for
  // why this bill posts one Dr per distinct account instead of the single fuzzy-matched
  // purchase-expense account every other document type in this app still uses) — lines
  // sharing the same account are merged into one journal line each, keyed by account so the
  // journal stays as short as the bill's actual account spread, not one row per line item.
  const items = await client.query<{ account_id: string | null; amount: string }>(
    `SELECT account_id, amount FROM bill_items WHERE bill_id = $1`,
    [billId]
  );
  const perAccount = new Map<string, number>();
  let anyMissingAccount = false;
  for (const item of items.rows) {
    if (!item.account_id) {
      anyMissingAccount = true;
      continue;
    }
    perAccount.set(item.account_id, round2((perAccount.get(item.account_id) ?? 0) + Number(item.amount)));
  }
  // A bill line with no account selected can't post a confident debit for its share of the
  // total — bail entirely (post nothing) rather than post a journal that quietly omits part
  // of what the bill actually says it cost, same "configuration isn't finished yet" philosophy
  // every other account-resolution failure in this file already follows.
  if (anyMissingAccount || perAccount.size === 0) return bail();

  const [apAccountId, taxAccountId] = await Promise.all([
    b.accounts_payable_account_id
      ? Promise.resolve(b.accounts_payable_account_id as string | null)
      : findAccountId(client, orgId, { types: ["accounts_payable"] }),
    taxTotal > 0 ? findAccountId(client, orgId, { types: ["other_current_liability"], nameLike: "vat" }) : Promise.resolve(null),
  ]);

  if (!apAccountId || (taxTotal > 0 && !taxAccountId)) return bail();

  const lines: JournalLineInput[] = [];
  for (const [accountId, amount] of perAccount) {
    if (amount <= 0) continue;
    lines.push({ accountId, description: `Bill ${b.bill_number}`, debit: amount, credit: 0 });
  }
  if (taxTotal > 0 && taxAccountId) {
    // Input VAT reduces the same VAT Payable liability output tax builds up — see the
    // matching note on syncExpenseJournal for why this app doesn't track a separate
    // recoverable-input-VAT account.
    lines.push({ accountId: taxAccountId, description: `Bill ${b.bill_number} — VAT`, debit: taxTotal, credit: 0 });
  }
  lines.push({ accountId: apAccountId, description: `Bill ${b.bill_number}`, debit: 0, credit: total });

  await replaceJournal(client, {
    orgId,
    billId,
    journalNumber: b.bill_number,
    journalDate: b.bill_date,
    referenceNumber: b.bill_number,
    notes: `Auto-generated from Bill ${b.bill_number}`,
    lines,
  });
}

/** Recomputes one bill's balance_due/status from every bill_payment_allocations row currently
 * pointing at it, counting only allocations whose payment is actually Paid (a Draft payment's
 * allocations are recorded for reference but don't touch a bill's balance — see
 * payments-made-api.ts's createPayment, the mirror of receipts-api.ts's createReceipt). Full
 * recompute, not an incremental patch, so applying/unapplying/deleting a payment can never
 * leave this drifted from what's actually allocated. Only touches status when the paid/unpaid
 * boundary actually changes — an Overdue or Open bill that's still fully unpaid keeps whichever
 * of those it was, rather than this function silently deciding between them. */
export async function recomputeBillBalance(client: PoolClient, orgId: string, billId: string) {
  const bill = await client.query<{ total: string; status: string }>(
    `SELECT total, status FROM bills WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
    [billId, orgId]
  );
  if (!bill.rowCount) return;
  const total = round2(Number(bill.rows[0].total));
  const currentStatus = bill.rows[0].status;

  const paidResult = await client.query<{ paid: string | null }>(
    `SELECT SUM(bpa.amount) AS paid FROM bill_payment_allocations bpa
     JOIN payments_made pm ON pm.id = bpa.payment_made_id
     WHERE bpa.bill_id = $1 AND pm.organization_id = $2 AND pm.status = 'paid'`,
    [billId, orgId]
  );
  const paid = round2(Number(paidResult.rows[0]?.paid ?? 0));
  const balanceDue = Math.max(0, round2(total - paid));

  let nextStatus = currentStatus;
  if (balanceDue <= 0.005 && total > 0) {
    nextStatus = "paid";
  } else if (balanceDue < total) {
    nextStatus = "partially_paid";
  } else if (currentStatus === "paid" || currentStatus === "partially_paid") {
    // Fully unwound back to nothing paid (e.g. the only payment against it was deleted).
    nextStatus = "open";
  }

  await client.query(`UPDATE bills SET balance_due = $1, status = $2 WHERE id = $3`, [balanceDue, nextStatus, billId]);
}

/** Syncs the auto-journal for one payment made: Dr Accounts Payable / Cr Bank — the mirror of
 * syncPaymentJournal. Posts for the payment's full amount regardless of how much of it is
 * actually allocated to a bill yet (mirrors Payments Received's "excess payment" case) — the
 * cash really did leave through this bank account either way; which bill(s) that reduces is
 * bill_payment_allocations' job, handled separately by recomputeBillBalance above (called by
 * payments-made-api.ts for every bill an allocation touches). */
export async function syncPaymentMadeJournal(client: PoolClient, orgId: string, paymentMadeId: string) {
  const payment = await client.query<{
    payment_number: string;
    payment_date: string;
    amount: string;
    bank_account_id: string | null;
  }>(
    `SELECT payment_number, payment_date, amount, bank_account_id FROM payments_made
     WHERE id = $1 AND organization_id = $2`,
    [paymentMadeId, orgId]
  );
  if (!payment.rowCount) return;
  const pmt = payment.rows[0];

  const amount = round2(Number(pmt.amount));
  if (amount <= 0 || !pmt.bank_account_id) {
    await replaceJournal(client, {
      orgId,
      paymentMadeId,
      journalNumber: pmt.payment_number,
      journalDate: pmt.payment_date,
      referenceNumber: pmt.payment_number,
      notes: "",
      lines: [],
    });
    return;
  }

  const [bankAccountId, apAccountId] = await Promise.all([
    getOrCreateBankGLAccount(client, orgId, pmt.bank_account_id),
    findAccountId(client, orgId, { types: ["accounts_payable"] }),
  ]);

  if (!bankAccountId || !apAccountId) {
    await replaceJournal(client, {
      orgId,
      paymentMadeId,
      journalNumber: pmt.payment_number,
      journalDate: pmt.payment_date,
      referenceNumber: pmt.payment_number,
      notes: "",
      lines: [],
    });
    return;
  }

  await replaceJournal(client, {
    orgId,
    paymentMadeId,
    journalNumber: pmt.payment_number,
    journalDate: pmt.payment_date,
    referenceNumber: pmt.payment_number,
    notes: `Auto-generated from Payment ${pmt.payment_number}`,
    lines: [
      { accountId: apAccountId, description: `Payment ${pmt.payment_number}`, debit: amount, credit: 0 },
      { accountId: bankAccountId, description: `Payment ${pmt.payment_number}`, debit: 0, credit: amount },
    ],
  });
}

/** Syncs the auto-journal for one expense: Dr [expense.account_id] + Dr [VAT Payable, if any]
 * / Cr [paid_through_account's bank GL account]. An expense is always immediate cash leaving
 * (no Accounts Payable staging the way a Bill has) — this app doesn't distinguish "expense
 * paid on credit" from "expense paid now", so every expense needs a Paid Through account to
 * post at all; one left blank quietly posts nothing rather than guessing which bank moved. */
export async function syncExpenseJournal(client: PoolClient, orgId: string, expenseId: string) {
  const expense = await client.query<{
    expense_date: string;
    amount: string;
    tax_amount: string;
    account_id: string | null;
    paid_through_account_id: string | null;
    reference_number: string | null;
  }>(
    `SELECT expense_date, amount, tax_amount, account_id, paid_through_account_id, reference_number FROM expenses
     WHERE id = $1 AND organization_id = $2`,
    [expenseId, orgId]
  );
  if (!expense.rowCount) return;
  const exp = expense.rows[0];
  const label = exp.reference_number || "Expense";

  const amount = round2(Number(exp.amount));
  const taxAmount = round2(Number(exp.tax_amount));
  const total = round2(amount + taxAmount);

  if (total <= 0 || !exp.account_id || !exp.paid_through_account_id) {
    await replaceJournal(client, {
      orgId,
      expenseId,
      journalNumber: label,
      journalDate: exp.expense_date,
      referenceNumber: label,
      notes: "",
      lines: [],
    });
    return;
  }

  const [bankAccountId, taxAccountId] = await Promise.all([
    getOrCreateBankGLAccount(client, orgId, exp.paid_through_account_id),
    taxAmount > 0 ? findAccountId(client, orgId, { types: ["other_current_liability"], nameLike: "vat" }) : Promise.resolve(null),
  ]);

  if (!bankAccountId || (taxAmount > 0 && !taxAccountId)) {
    await replaceJournal(client, {
      orgId,
      expenseId,
      journalNumber: label,
      journalDate: exp.expense_date,
      referenceNumber: label,
      notes: "",
      lines: [],
    });
    return;
  }

  const lines: JournalLineInput[] = [{ accountId: exp.account_id, description: label, debit: amount, credit: 0 }];
  if (taxAmount > 0 && taxAccountId) {
    lines.push({ accountId: taxAccountId, description: `${label} — VAT`, debit: taxAmount, credit: 0 });
  }
  lines.push({ accountId: bankAccountId, description: label, debit: 0, credit: total });

  await replaceJournal(client, {
    orgId,
    expenseId,
    journalNumber: label,
    journalDate: exp.expense_date,
    referenceNumber: label,
    notes: `Auto-generated from Expense${exp.reference_number ? ` ${exp.reference_number}` : ""}`,
    lines,
  });
}

/** Syncs the auto-journal for one vendor credit: Dr Accounts Payable [total] / Cr [each line's
 * account, merged by account] + Cr [VAT Payable, if any] — the mirror of syncBillJournal,
 * reversed for the vendor side (a vendor credit un-does part of what a bill posted: it reduces
 * what's owed and reduces the expense/asset originally recognized against it). Posts for both
 * "open" and "closed" status (there's no void/draft concept here, so a vendor credit only ever
 * needs to be un-posted if it's deleted, which ON DELETE CASCADE already handles).
 *
 * Scope decision (see the "vendor credit with proper accounting" request this was built for):
 * this posts a correct GL entry for the credit itself, but — like the pre-existing gap this
 * function used to have disclosed in its own comment — a vendor credit still isn't linked to
 * any specific bill and can't reduce one's balance_due the way a Payment Made can. Applying a
 * vendor credit against an open bill (Zoho's separate "Apply Credits" action) is out of scope
 * here; it reduces the org's AP balance in aggregate on the books, not any one bill's. */
export async function syncVendorCreditJournal(client: PoolClient, orgId: string, vendorCreditId: string) {
  const credit = await client.query<{
    credit_note_number: string;
    credit_date: string;
    tax_total: string;
    total: string;
    accounts_payable_account_id: string | null;
  }>(
    `SELECT credit_note_number, credit_date, tax_total, total, accounts_payable_account_id FROM vendor_credits
     WHERE id = $1 AND organization_id = $2`,
    [vendorCreditId, orgId]
  );
  if (!credit.rowCount) return;
  const vc = credit.rows[0];

  const bail = () =>
    replaceJournal(client, {
      orgId,
      vendorCreditId,
      journalNumber: vc.credit_note_number,
      journalDate: vc.credit_date,
      referenceNumber: vc.credit_note_number,
      notes: "",
      lines: [],
    });

  const taxTotal = round2(Number(vc.tax_total));
  const total = round2(Number(vc.total));
  if (total <= 0) return bail();

  const items = await client.query<{ account_id: string | null; amount: string }>(
    `SELECT account_id, amount FROM vendor_credit_items WHERE vendor_credit_id = $1`,
    [vendorCreditId]
  );
  const perAccount = new Map<string, number>();
  let anyMissingAccount = false;
  for (const item of items.rows) {
    if (!item.account_id) {
      anyMissingAccount = true;
      continue;
    }
    perAccount.set(item.account_id, round2((perAccount.get(item.account_id) ?? 0) + Number(item.amount)));
  }
  if (anyMissingAccount || perAccount.size === 0) return bail();

  const [apAccountId, taxAccountId] = await Promise.all([
    vc.accounts_payable_account_id
      ? Promise.resolve(vc.accounts_payable_account_id as string | null)
      : findAccountId(client, orgId, { types: ["accounts_payable"] }),
    taxTotal > 0 ? findAccountId(client, orgId, { types: ["other_current_liability"], nameLike: "vat" }) : Promise.resolve(null),
  ]);

  if (!apAccountId || (taxTotal > 0 && !taxAccountId)) return bail();

  const lines: JournalLineInput[] = [
    { accountId: apAccountId, description: `Vendor Credit ${vc.credit_note_number}`, debit: total, credit: 0 },
  ];
  for (const [accountId, amount] of perAccount) {
    if (amount <= 0) continue;
    lines.push({ accountId, description: `Vendor Credit ${vc.credit_note_number}`, debit: 0, credit: amount });
  }
  if (taxTotal > 0 && taxAccountId) {
    lines.push({ accountId: taxAccountId, description: `Vendor Credit ${vc.credit_note_number} — VAT`, debit: 0, credit: taxTotal });
  }

  await replaceJournal(client, {
    orgId,
    vendorCreditId,
    journalNumber: vc.credit_note_number,
    journalDate: vc.credit_date,
    referenceNumber: vc.credit_note_number,
    notes: `Auto-generated from Vendor Credit ${vc.credit_note_number}`,
    lines,
  });
}

// ---------------------------------------------------------------------------------------
// Opening Balances (Settings -> Setup & Configurations -> Opening Balances) — a single,
// org-wide consolidated journal rather than one journal per document, so it doesn't fit
// replaceJournal's per-document link-column shape above. manual_journals.is_opening_balance
// (+ a partial unique index on organization_id) is this feature's equivalent of that link
// column — there's no one row to point a FK at, since this journal represents the org's
// entire opening trial balance, not a single document.
// ---------------------------------------------------------------------------------------

/** Finds the org's system "Opening Balance Adjustments" account by its exact seeded name
 * (see org-provisioning.ts's DEFAULT_ACCOUNTS and the 2026-09-11 migration's backfill) —
 * deliberately NOT using findAccountId's type-based fallback like every other lookup in this
 * file, because falling back to "any other_current_liability/equity account" here could
 * silently plug the opening-balance difference into an unrelated real account (e.g. VAT
 * Payable, Owner's Equity) instead of just not posting. Renaming or deleting this account
 * breaks auto-balancing the same way deleting any other fuzzy-matched default account in this
 * app already does — a disclosed, not a new, risk. */
async function findOpeningBalanceAdjustmentsAccountId(client: PoolClient, orgId: string): Promise<string | null> {
  const res = await client.query<{ id: string }>(
    `SELECT id FROM accounts WHERE organization_id = $1 AND is_active AND name = 'Opening Balance Adjustments' LIMIT 1`,
    [orgId]
  );
  return res.rowCount ? res.rows[0].id : null;
}

/** Rebuilds the org's single consolidated Opening Balance journal from three sources:
 *   1. Every account_opening_balances row (directly-entered Asset/Liability/Equity balances,
 *      entered via the settings page itself — never Accounts Receivable/Accounts Payable,
 *      which are derived below instead, matching Zoho's own behavior of tracking those
 *      per-customer/per-vendor rather than as a single number).
 *   2. SUM(customers.opening_balance) across the org, posted to the org's Accounts
 *      Receivable account — the same opening_balance field CustomerForm.tsx has always
 *      captured but that, until this feature, fed nothing downstream.
 *   3. SUM(vendors.opening_balance) across the org, posted to Accounts Payable (a new column
 *      this migration adds — vendors never had one before, unlike customers).
 * Whatever doesn't already balance is posted to "Opening Balance Adjustments" so the entry
 * always balances without the user hand-computing the difference themselves.
 *
 * Safe to call any time, on any number of saves, in any order — same "always call, let it
 * figure out the current truth" contract as every other syncXJournal in this file. If the
 * org has no Migration Date set (Opening Balances has never been configured, or was just
 * cleared via Delete), this simply removes any existing opening-balance journal and returns.
 * Called after the Opening Balances settings page itself saves/deletes, and after every
 * Customer/Vendor create/update/delete (see those routes), so a customer's or vendor's
 * opening_balance edit keeps the consolidated entry current from then on — but only once the
 * org has actually turned this feature on by setting a Migration Date; before that, editing a
 * customer's/vendor's opening_balance has zero GL effect, exactly as it always has. */
export async function syncOpeningBalanceJournal(client: PoolClient, orgId: string) {
  const org = await client.query<{ opening_balance_migration_date: string | null }>(
    `SELECT opening_balance_migration_date FROM organizations WHERE id = $1`,
    [orgId]
  );
  const migrationDate = org.rows[0]?.opening_balance_migration_date ?? null;

  const existing = await client.query<{ journal_number: string }>(
    `SELECT journal_number FROM manual_journals WHERE organization_id = $1 AND is_opening_balance = true`,
    [orgId]
  );
  await client.query(`DELETE FROM manual_journals WHERE organization_id = $1 AND is_opening_balance = true`, [orgId]);

  if (!migrationDate) return;

  const lines: JournalLineInput[] = [];

  const accountRows = await client.query<{ account_id: string; debit: string; credit: string }>(
    `SELECT account_id, debit, credit FROM account_opening_balances
     WHERE organization_id = $1 AND (debit <> 0 OR credit <> 0)`,
    [orgId]
  );
  for (const row of accountRows.rows) {
    lines.push({
      accountId: row.account_id,
      description: "Opening Balance",
      debit: round2(Number(row.debit)),
      credit: round2(Number(row.credit)),
    });
  }

  const [customerSum, vendorSum, arAccountId, apAccountId] = await Promise.all([
    client.query<{ sum: string | null }>(`SELECT SUM(opening_balance) AS sum FROM customers WHERE organization_id = $1`, [orgId]),
    client.query<{ sum: string | null }>(`SELECT SUM(opening_balance) AS sum FROM vendors WHERE organization_id = $1`, [orgId]),
    findAccountId(client, orgId, { types: ["accounts_receivable"] }),
    findAccountId(client, orgId, { types: ["accounts_payable"] }),
  ]);

  const arTotal = round2(Number(customerSum.rows[0]?.sum ?? 0));
  if (arTotal !== 0 && arAccountId) {
    lines.push({
      accountId: arAccountId,
      description: "Opening Balance — Accounts Receivable",
      debit: arTotal > 0 ? arTotal : 0,
      credit: arTotal < 0 ? -arTotal : 0,
    });
  }

  const apTotal = round2(Number(vendorSum.rows[0]?.sum ?? 0));
  if (apTotal !== 0 && apAccountId) {
    lines.push({
      accountId: apAccountId,
      description: "Opening Balance — Accounts Payable",
      debit: apTotal < 0 ? -apTotal : 0,
      credit: apTotal > 0 ? apTotal : 0,
    });
  }

  if (lines.length === 0) return;

  const totalDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
  const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
  const diff = round2(totalDebit - totalCredit);
  if (diff !== 0) {
    const adjustmentsAccountId = await findOpeningBalanceAdjustmentsAccountId(client, orgId);
    // Can't balance without the plug account — post nothing rather than an unbalanced entry,
    // matching this file's standing "quietly post nothing on missing configuration" rule.
    if (!adjustmentsAccountId) return;
    lines.push({
      accountId: adjustmentsAccountId,
      description: "Opening Balance Adjustments",
      debit: diff < 0 ? -diff : 0,
      credit: diff > 0 ? diff : 0,
    });
  }

  const journalNumber = existing.rows[0]?.journal_number ?? (await claimNextNumber(client, orgId, "manual-journals"));
  const header = await client.query<{ id: string }>(
    `INSERT INTO manual_journals
       (organization_id, journal_number, journal_date, reference_number, status, notes, is_opening_balance)
     VALUES ($1, $2, $3, $4, 'published', $5, true) RETURNING id`,
    [orgId, journalNumber, migrationDate, "Opening Balance", "Auto-generated from the Opening Balances settings page"]
  );
  const journalId = header.rows[0].id;
  for (const line of lines) {
    await client.query(
      `INSERT INTO journal_lines (journal_id, account_id, description, debit, credit) VALUES ($1, $2, $3, $4, $5)`,
      [journalId, line.accountId, line.description, line.debit, line.credit]
    );
  }
}
