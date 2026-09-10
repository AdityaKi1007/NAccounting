import type { PoolClient } from "pg";

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

/** The GL account "behind" a bank account, creating and linking one on first use if it was
 * never set (covers bank accounts created before migrations/1758600000000_auto_journals.js,
 * or added by hand outside provisionOrganization). */
async function getOrCreateBankGLAccount(client: PoolClient, orgId: string, bankAccountId: string): Promise<string | null> {
  const bank = await client.query<{ id: string; account_name: string; gl_account_id: string | null }>(
    `SELECT id, account_name, gl_account_id FROM bank_accounts WHERE id = $1 AND organization_id = $2`,
    [bankAccountId, orgId]
  );
  if (!bank.rowCount) return null;
  const row = bank.rows[0];
  if (row.gl_account_id) return row.gl_account_id;

  const created = await client.query<{ id: string }>(
    `INSERT INTO accounts (organization_id, name, type) VALUES ($1, $2, 'cash') RETURNING id`,
    [orgId, row.account_name]
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
                : "vendor_credit_id";
  const linkValue = invoiceId ?? paymentId ?? creditNoteId ?? debitNoteId ?? billId ?? paymentMadeId ?? expenseId ?? vendorCreditId;

  await client.query(`DELETE FROM manual_journals WHERE organization_id = $1 AND ${linkColumn} = $2`, [orgId, linkValue]);
  if (lines.length === 0) return;

  const header = await client.query<{ id: string }>(
    `INSERT INTO manual_journals
       (organization_id, journal_number, journal_date, reference_number, status, notes,
        invoice_id, payment_id, credit_note_id, debit_note_id, bill_id, payment_made_id, expense_id, vendor_credit_id)
     VALUES ($1, $2, $3, $4, 'published', $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
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

  // Void and Draft invoices aren't real, posted revenue yet — no journal for either.
  if (inv.status === "draft" || inv.status === "void") {
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

  const [arAccountId, incomeAccountId, taxAccountId] = await Promise.all([
    findAccountId(client, orgId, { types: ["accounts_receivable"] }),
    findAccountId(client, orgId, { types: ["income", "other_income"], nameLike: "sales" }),
    taxTotal > 0 ? findAccountId(client, orgId, { types: ["other_current_liability"], nameLike: "vat" }) : Promise.resolve(null),
  ]);

  // Can't post a journal that won't balance — if the org's Chart of Accounts is missing
  // Accounts Receivable or an Income account entirely, skip posting rather than guess.
  if (!arAccountId || !incomeAccountId || (taxTotal > 0 && !taxAccountId)) {
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

  const lines: JournalLineInput[] = [
    { accountId: arAccountId, description: `Invoice ${inv.invoice_number}`, debit: total, credit: 0 },
    { accountId: incomeAccountId, description: `Invoice ${inv.invoice_number}`, debit: 0, credit: subtotal },
  ];
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

/** The account a Bill/Vendor Credit's non-VAT portion posts against. There's no per-line
 * expense-account selection on bill_items (same simplification invoices made for Income —
 * see the module comment on syncInvoiceJournal's sibling), so every bill posts to one default
 * account for its full subtotal, preferring "Cost of Goods Sold" by name (that's what
 * provisionOrganization seeds) and otherwise any cost_of_goods_sold/expense-type account. */
async function findPurchaseExpenseAccountId(client: PoolClient, orgId: string): Promise<string | null> {
  return findAccountId(client, orgId, { types: ["cost_of_goods_sold", "expense"], nameLike: "cost of goods" });
}

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
  }>(
    `SELECT bill_number, bill_date, status, subtotal, tax_total, total FROM bills
     WHERE id = $1 AND organization_id = $2`,
    [billId, orgId]
  );
  if (!bill.rowCount) return;
  const b = bill.rows[0];

  if (b.status === "draft") {
    await replaceJournal(client, {
      orgId,
      billId,
      journalNumber: b.bill_number,
      journalDate: b.bill_date,
      referenceNumber: b.bill_number,
      notes: "",
      lines: [],
    });
    return;
  }

  const subtotal = round2(Number(b.subtotal));
  const taxTotal = round2(Number(b.tax_total));
  const total = round2(Number(b.total));
  if (total <= 0) {
    await replaceJournal(client, {
      orgId,
      billId,
      journalNumber: b.bill_number,
      journalDate: b.bill_date,
      referenceNumber: b.bill_number,
      notes: "",
      lines: [],
    });
    return;
  }

  const [apAccountId, expenseAccountId, taxAccountId] = await Promise.all([
    findAccountId(client, orgId, { types: ["accounts_payable"] }),
    findPurchaseExpenseAccountId(client, orgId),
    taxTotal > 0 ? findAccountId(client, orgId, { types: ["other_current_liability"], nameLike: "vat" }) : Promise.resolve(null),
  ]);

  if (!apAccountId || !expenseAccountId || (taxTotal > 0 && !taxAccountId)) {
    await replaceJournal(client, {
      orgId,
      billId,
      journalNumber: b.bill_number,
      journalDate: b.bill_date,
      referenceNumber: b.bill_number,
      notes: "",
      lines: [],
    });
    return;
  }

  const lines: JournalLineInput[] = [
    { accountId: expenseAccountId, description: `Bill ${b.bill_number}`, debit: subtotal, credit: 0 },
  ];
  if (taxTotal > 0 && taxAccountId) {
    // Input VAT reduces the same VAT Payable liability output tax builds up — see the
    // matching note on syncExpenseJournal for why this app doesn't track a separate
    // recoverable-input-VAT account.
    lines.push({ accountId: taxAccountId, description: `Bill ${b.bill_number}`, debit: taxTotal, credit: 0 });
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

/** Recomputes one bill's balance_due/status from every payments_made row currently pointing
 * at it (full recompute, not an incremental patch — Payments Made is a plain generic-CRUD
 * entity that can be edited or deleted directly, unlike Payments Received's dedicated
 * create-only allocation flow, so "sum what's actually there right now" is the only version
 * of this that can't drift). Only touches status when the paid/unpaid boundary actually
 * changes — an Overdue or Open bill that's still fully unpaid keeps whichever of those it was,
 * rather than this function silently deciding between them. */
export async function recomputeBillBalance(client: PoolClient, orgId: string, billId: string) {
  const bill = await client.query<{ total: string; status: string }>(
    `SELECT total, status FROM bills WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
    [billId, orgId]
  );
  if (!bill.rowCount) return;
  const total = round2(Number(bill.rows[0].total));
  const currentStatus = bill.rows[0].status;

  const paidResult = await client.query<{ paid: string | null }>(
    `SELECT SUM(amount) AS paid FROM payments_made WHERE bill_id = $1 AND organization_id = $2`,
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
 * syncPaymentJournal. Unlike Payments Received, this app doesn't give Payments Made a
 * multi-bill allocation picker (it's a plain "Against Bill" single-select — see entities.ts),
 * so there's no unapplied/bank-charges split to post here; a payment not linked to any
 * specific bill still posts (it's real cash leaving through a real reduction of what's owed),
 * it just doesn't reduce any one bill's balance_due (see recomputeBillBalance above, called
 * separately by the route handler for whichever bill(s) were actually affected). */
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

/** Syncs the auto-journal for one vendor credit: Dr Accounts Payable / Cr [purchase expense],
 * for its `total` — the mirror of a credit note, reversed for the vendor side. Unlike Credit/
 * Debit Notes, Vendor Credits in this app are a plain flat record with no invoice-style
 * `subtotal`/`tax_total` split and no link to a specific bill (see entities.ts) — a real gap
 * (it can't auto-close a bill's balance_due the way a payment can), but out of scope for the
 * ledger fix this function exists for. Posts for both "open" and "closed" status (there's no
 * void/draft concept here, so a vendor credit only ever needs to be un-posted if it's deleted,
 * which ON DELETE CASCADE already handles). */
export async function syncVendorCreditJournal(client: PoolClient, orgId: string, vendorCreditId: string) {
  const credit = await client.query<{
    credit_note_number: string;
    credit_date: string;
    total: string;
  }>(
    `SELECT credit_note_number, credit_date, total FROM vendor_credits
     WHERE id = $1 AND organization_id = $2`,
    [vendorCreditId, orgId]
  );
  if (!credit.rowCount) return;
  const vc = credit.rows[0];

  const total = round2(Number(vc.total));
  if (total <= 0) {
    await replaceJournal(client, {
      orgId,
      vendorCreditId,
      journalNumber: vc.credit_note_number,
      journalDate: vc.credit_date,
      referenceNumber: vc.credit_note_number,
      notes: "",
      lines: [],
    });
    return;
  }

  const [apAccountId, expenseAccountId] = await Promise.all([
    findAccountId(client, orgId, { types: ["accounts_payable"] }),
    findPurchaseExpenseAccountId(client, orgId),
  ]);

  if (!apAccountId || !expenseAccountId) {
    await replaceJournal(client, {
      orgId,
      vendorCreditId,
      journalNumber: vc.credit_note_number,
      journalDate: vc.credit_date,
      referenceNumber: vc.credit_note_number,
      notes: "",
      lines: [],
    });
    return;
  }

  await replaceJournal(client, {
    orgId,
    vendorCreditId,
    journalNumber: vc.credit_note_number,
    journalDate: vc.credit_date,
    referenceNumber: vc.credit_note_number,
    notes: `Auto-generated from Vendor Credit ${vc.credit_note_number}`,
    lines: [
      { accountId: apAccountId, description: `Vendor Credit ${vc.credit_note_number}`, debit: total, credit: 0 },
      { accountId: expenseAccountId, description: `Vendor Credit ${vc.credit_note_number}`, debit: 0, credit: total },
    ],
  });
}
