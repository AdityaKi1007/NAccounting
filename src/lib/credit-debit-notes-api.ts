import { pool, queryOne } from "@/lib/db";
import { getOrCreateNumberSeries, claimNextNumber } from "@/lib/number-series";
import { syncCreditNoteJournal, syncDebitNoteJournal } from "@/lib/auto-journal";
import { idBelongsToOrg, idsBelongToOrg } from "@/lib/tenant-guard";
import { recordAuditLog, type AuditActor } from "@/lib/audit-log";

// Credit Notes and Debit Notes are always created FROM one specific invoice (there's no
// standalone "+ New Credit Note" flow that isn't tied to an invoice — a deliberate scope
// decision) and their effect applies straight to that invoice's balance_due, in the same
// transaction as the note itself and its GL journal. Unlike the generic
// createDocument()/updateDocument() in documents-api.ts, this is intentionally NOT split
// across two transactions the way the Sales Order → Invoice/PO conversion routes are —
// balance_due has to stay exactly in sync with what was actually posted, so this owns its
// own transaction end to end rather than reusing createDocument for the row insert.

export interface NoteLineInput {
  item_id?: string | null;
  description?: string;
  quantity?: number;
  rate?: number;
}

export interface NoteBody {
  note_date?: string;
  reference_number?: string;
  reason?: string;
  lines: NoteLineInput[];
  taxPercent?: number;
  /** API-only (see migrations/1779000000000_legal_entity_on_documents.js) — there is no field
   * for this in the app's own credit-memo UI. Create-only, same as every other credit-memo
   * field: credit_notes has no v1 update endpoint at all (see
   * /api/v1/credit-notes/[id]/route.ts's own comment), and the column only exists on
   * credit_notes, not debit_notes, so this is only ever written when kind === "credit". */
  legal_entity_id?: string | null;
}

export interface NoteActionResult {
  ok: boolean;
  id?: string;
  error?: string;
  status?: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

interface InvoiceRow {
  id: string;
  customer_id: string | null;
  status: string;
  total: string;
  balance_due: string;
}

/** Lists credit/debit note headers for the org, newest first — used by the v1 API's
 * GET /api/v1/credit-notes list endpoint (kind is always "credit" there; "debit" is kept
 * generic here in case debit notes are ever exposed the same way, per the disclosed scope
 * decision that only Credit Memos were asked for this round). No line items — see
 * getCreditOrDebitNote below for the single-record shape with line_items attached. */
export async function listCreditOrDebitNotes(kind: "credit" | "debit", orgId: string) {
  const table = kind === "credit" ? "credit_notes" : "debit_notes";
  const dateField = kind === "credit" ? "credit_note_date" : "debit_note_date";
  const numberField = kind === "credit" ? "credit_note_number" : "debit_note_number";
  // legal_entity_id only exists on credit_notes (see
  // migrations/1779000000000_legal_entity_on_documents.js) — selected as a literal null for
  // debit notes so both kinds return the same column shape.
  const legalEntityColumn = kind === "credit" ? "legal_entity_id" : "NULL AS legal_entity_id";
  const result = await pool.query(
    `SELECT id, organization_id, ${numberField} AS number, customer_id, invoice_id, ${dateField} AS note_date, status,
            subtotal, tax_total, total, balance_applied, reference_number, reason, created_at, ${legalEntityColumn}
       FROM ${table} WHERE organization_id = $1 ORDER BY created_at DESC`,
    [orgId]
  );
  return result.rows;
}

/** Single credit/debit note with its line items attached (line_items) — the v1 API's
 * GET /api/v1/credit-notes/{id} shape. Returns null if not found in this org. */
export async function getCreditOrDebitNote(kind: "credit" | "debit", orgId: string, noteId: string) {
  const table = kind === "credit" ? "credit_notes" : "debit_notes";
  const itemsTable = kind === "credit" ? "credit_note_items" : "debit_note_items";
  const parentField = kind === "credit" ? "credit_note_id" : "debit_note_id";
  const dateField = kind === "credit" ? "credit_note_date" : "debit_note_date";
  const numberField = kind === "credit" ? "credit_note_number" : "debit_note_number";
  const legalEntityColumn = kind === "credit" ? "legal_entity_id" : "NULL AS legal_entity_id";

  const header = await queryOne<Record<string, unknown>>(
    `SELECT id, organization_id, ${numberField} AS number, customer_id, invoice_id, ${dateField} AS note_date, status,
            subtotal, tax_total, total, balance_applied, reference_number, reason, created_at, ${legalEntityColumn}
       FROM ${table} WHERE id = $1 AND organization_id = $2`,
    [noteId, orgId]
  );
  if (!header) return null;

  const items = await pool.query(
    `SELECT id, item_id, description, quantity, rate, amount FROM ${itemsTable} WHERE ${parentField} = $1 ORDER BY id`,
    [noteId]
  );
  return { ...header, line_items: items.rows };
}

/** kind: "credit" reduces the invoice's balance_due (capped at 0 — a credit note can't push
 * balance_due negative in this simplified, apply-directly model); "debit" increases it
 * (uncapped — it's additional billing, there's no ceiling on what a customer can owe). */
export async function createCreditOrDebitNote(
  kind: "credit" | "debit",
  orgId: string,
  invoiceId: string,
  body: NoteBody,
  actor: AuditActor = {}
): Promise<NoteActionResult> {
  const lines = (body.lines ?? []).filter((l) => (l.description || l.item_id) && Number(l.quantity) > 0);
  if (lines.length === 0) {
    return { ok: false, error: "Add at least one line item.", status: 400 };
  }
  const lineItemIds = [...new Set(lines.map((l) => l.item_id).filter((v): v is string => Boolean(v)))];
  if (lineItemIds.length > 0 && !(await idsBelongToOrg("items", lineItemIds, orgId))) {
    return { ok: false, error: "One or more selected items are invalid.", status: 400 };
  }
  if (kind === "credit" && body.legal_entity_id && !(await idBelongsToOrg("legal_entities", body.legal_entity_id, orgId))) {
    return { ok: false, error: "Select a valid Legal Entity.", status: 400 };
  }

  const table = kind === "credit" ? "credit_notes" : "debit_notes";
  const itemsTable = kind === "credit" ? "credit_note_items" : "debit_note_items";
  const parentField = kind === "credit" ? "credit_note_id" : "debit_note_id";
  const numberField = kind === "credit" ? "credit_note_number" : "debit_note_number";
  const dateField = kind === "credit" ? "credit_note_date" : "debit_note_date";
  const numberSeriesKey = kind === "credit" ? "credit-notes" : "debit-notes";
  const numberPrefix = kind === "credit" ? "CN" : "DN";
  const label = kind === "credit" ? "Credit Note" : "Debit Note";

  const invoice = await queryOne<InvoiceRow>(
    `SELECT id, customer_id, status, total, balance_due FROM invoices WHERE id = $1 AND organization_id = $2`,
    [invoiceId, orgId]
  );
  if (!invoice) return { ok: false, error: "Invoice not found.", status: 404 };
  if (invoice.status === "draft" || invoice.status === "void") {
    return { ok: false, error: `A ${invoice.status} invoice can't have a ${label.toLowerCase()} created against it.`, status: 400 };
  }
  if (!invoice.customer_id) return { ok: false, error: "This invoice has no customer.", status: 400 };

  const subtotal = round2(lines.reduce((sum, l) => sum + Number(l.quantity ?? 0) * Number(l.rate ?? 0), 0));
  const taxPercent = Number(body.taxPercent ?? 0);
  const taxTotal = round2(subtotal * (taxPercent / 100));
  const total = round2(subtotal + taxTotal);
  if (total <= 0) return { ok: false, error: "Total must be greater than 0.", status: 400 };

  const series = await getOrCreateNumberSeries(orgId, numberSeriesKey);
  if (series.mode === "manual") {
    return { ok: false, error: `${label} # is required.`, status: 400 };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock the invoice row for the duration — the balance_due read above (outside the
    // transaction) is just for the up-front status check; this is the value actually used.
    const lockedInvoice = await client.query<InvoiceRow>(
      `SELECT id, customer_id, status, total, balance_due FROM invoices WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [invoiceId, orgId]
    );
    const inv = lockedInvoice.rows[0];
    if (!inv) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Invoice not found.", status: 404 };
    }

    const number = await claimNextNumber(client, orgId, numberSeriesKey);

    const currentDue = round2(Number(inv.balance_due));
    const currentTotal = round2(Number(inv.total));
    const newDue =
      kind === "credit" ? Math.max(0, round2(currentDue - total)) : round2(currentDue + total);
    // The amount actually removed from (credit) or added to (debit) balance_due — NOT
    // necessarily the note's own `total`. A credit note's `total` can exceed the invoice's
    // current balance_due (crediting the full original amount after most of it has already
    // been paid, say); the floor at 0 above means only `currentDue - newDue` of it actually
    // landed on the invoice. Recording this is what lets voidCreditOrDebitNote() reverse by
    // the right amount later instead of naively adding back the full `total` and inflating
    // balance_due past the invoice's own total (a real bug this was written to fix — see
    // migrations/1759600000000_credit_debit_note_balance_applied.js for the full story). A
    // debit note's application is never clipped, so its balanceApplied always just equals
    // `total`.
    const balanceApplied = round2(Math.abs(currentDue - newDue));

    // legal_entity_id only exists on the credit_notes table (see
    // migrations/1779000000000_legal_entity_on_documents.js) — debit_notes never got the
    // column, since debit notes aren't part of the v1 API surface this was requested for —
    // so it's appended to the column/value lists only when kind === "credit" rather than
    // being a plain always-present column like the rest of this INSERT.
    const legalEntityColumn = kind === "credit" ? ", legal_entity_id" : "";
    const legalEntityPlaceholder = kind === "credit" ? ", $12" : "";
    const headerResult = await client.query(
      `INSERT INTO ${table}
         (organization_id, ${numberField}, customer_id, invoice_id, ${dateField}, status, subtotal, tax_total, total, reference_number, reason, balance_applied${legalEntityColumn})
       VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, $8, $9, $10, $11${legalEntityPlaceholder})
       RETURNING id`,
      [
        orgId,
        number,
        inv.customer_id,
        invoiceId,
        body.note_date || new Date().toISOString().slice(0, 10),
        subtotal,
        taxTotal,
        total,
        body.reference_number || null,
        body.reason || null,
        balanceApplied,
        ...(kind === "credit" ? [body.legal_entity_id || null] : []),
      ]
    );
    const noteId = headerResult.rows[0].id as string;

    for (const line of lines) {
      const amount = round2(Number(line.quantity ?? 0) * Number(line.rate ?? 0));
      await client.query(
        `INSERT INTO ${itemsTable} (${parentField}, item_id, description, quantity, rate, amount)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [noteId, line.item_id || null, line.description || null, line.quantity ?? 0, line.rate ?? 0, amount]
      );
    }

    // Paid/Partially Paid stay exclusively derived from balance_due, same rule
    // documents-api.ts enforces for direct edits — a credit note that fully offsets the
    // remaining balance marks the invoice Paid (settled, even though no cash moved); a debit
    // note never reduces balance_due, so it can only ever move Paid back to Partially Paid or
    // leave status alone.
    const newStatus = newDue <= 0.005 ? "paid" : newDue < currentTotal ? "partially_paid" : inv.status;
    await client.query(`UPDATE invoices SET balance_due = $1, status = $2 WHERE id = $3 AND organization_id = $4`, [
      newDue,
      newStatus,
      invoiceId,
      orgId,
    ]);

    if (kind === "credit") {
      await syncCreditNoteJournal(client, orgId, noteId);
    } else {
      await syncDebitNoteJournal(client, orgId, noteId);
    }

    // Debit Notes were never part of the audit-log request (only "credit memo" was) — see
    // audit-log.ts's own comment for the full list of what's in/out of scope.
    let auditNewRow: Record<string, unknown> | undefined;
    if (kind === "credit") {
      auditNewRow = (await client.query(`SELECT * FROM ${table} WHERE id = $1`, [noteId])).rows[0] as
        | Record<string, unknown>
        | undefined;
    }

    await client.query("COMMIT");

    if (kind === "credit") {
      await recordAuditLog({
        orgId,
        actor,
        action: "create",
        module: "credit-notes",
        entityId: noteId,
        entityLabel: auditNewRow ? String(auditNewRow[numberField] ?? "") : null,
        oldData: null,
        newData: auditNewRow ?? null,
      });
    }

    return { ok: true, id: noteId };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    const pgCode = (err as { code?: string } | null)?.code;
    const message =
      pgCode === "42703" || pgCode === "42P01"
        ? `Database schema is out of date for ${label}s — run \`npm run migrate:up\` and try again.`
        : `Could not save this ${label.toLowerCase()}.`;
    return { ok: false, error: message, status: 500 };
  } finally {
    client.release();
  }
}

/** Reverses a credit/debit note: puts back the balance_due adjustment it actually made — using
 * the note's recorded `balance_applied` (not its raw `total`; see that field's own comment in
 * createCreditOrDebitNote above), since a credit note's application can have been floored at 0
 * at creation time, in which case less than its full `total` ever reduced balance_due, and
 * reversing by `total` would over-restore it. Recomputes status the same way
 * createCreditOrDebitNote does (with a defensive clamp to [0, invoice total]), marks the note
 * void, and removes its GL journal. Safe to call even if the invoice was itself edited since
 * (the current balance_due is read fresh under lock, not assumed unchanged). */
export async function voidCreditOrDebitNote(
  kind: "credit" | "debit",
  orgId: string,
  noteId: string,
  actor: AuditActor = {}
): Promise<NoteActionResult> {
  const table = kind === "credit" ? "credit_notes" : "debit_notes";
  const numberField = kind === "credit" ? "credit_note_number" : "debit_note_number";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // SELECT * (not just the columns this function itself needs) so the full pre-void row is
    // available as old_data for the audit log below — a plain SELECT alongside the typed one
    // rather than widening the typed query, so every existing `note.<field>` reference below
    // keeps its narrow, already-correct type.
    const auditOldRow =
      kind === "credit"
        ? ((await client.query(`SELECT * FROM ${table} WHERE id = $1 AND organization_id = $2`, [noteId, orgId])).rows[0] as
            | Record<string, unknown>
            | undefined)
        : undefined;

    const noteResult = await client.query<{
      id: string;
      invoice_id: string | null;
      status: string;
      total: string;
      balance_applied: string;
    }>(
      `SELECT id, invoice_id, status, total, balance_applied FROM ${table} WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [noteId, orgId]
    );
    const note = noteResult.rows[0];
    if (!note) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Not found.", status: 404 };
    }
    if (note.status === "void") {
      await client.query("ROLLBACK");
      return { ok: false, error: "Already void.", status: 400 };
    }

    if (note.invoice_id) {
      const invoiceResult = await client.query<InvoiceRow>(
        `SELECT id, customer_id, status, total, balance_due FROM invoices WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        [note.invoice_id, orgId]
      );
      const inv = invoiceResult.rows[0];
      if (inv) {
        const currentDue = round2(Number(inv.balance_due));
        const currentTotal = round2(Number(inv.total));
        // Reverse by the amount actually applied at creation time (balance_applied), not the
        // note's raw total — for a credit note those can differ when the application was
        // floored at 0 (see balance_applied's own comment in createCreditOrDebitNote above,
        // and migrations/1759600000000_credit_debit_note_balance_applied.js). A debit note's
        // balance_applied always equals total since its application is never clipped.
        const applied = round2(Number(note.balance_applied));
        const rawNewDue =
          kind === "credit" ? round2(currentDue + applied) : Math.max(0, round2(currentDue - applied));
        // Defensive cap: balance_due should never end up outside [0, total] regardless of any
        // edits made to the invoice since the note was created.
        const newDue = Math.min(currentTotal, Math.max(0, rawNewDue));
        const newStatus = newDue <= 0.005 ? "paid" : newDue < currentTotal ? "partially_paid" : "sent";
        await client.query(`UPDATE invoices SET balance_due = $1, status = $2 WHERE id = $3 AND organization_id = $4`, [
          newDue,
          newStatus,
          note.invoice_id,
          orgId,
        ]);
      }
    }

    await client.query(`UPDATE ${table} SET status = 'void' WHERE id = $1 AND organization_id = $2`, [noteId, orgId]);

    if (kind === "credit") {
      await syncCreditNoteJournal(client, orgId, noteId);
    } else {
      await syncDebitNoteJournal(client, orgId, noteId);
    }

    let auditNewRow: Record<string, unknown> | undefined;
    if (kind === "credit") {
      auditNewRow = (await client.query(`SELECT * FROM ${table} WHERE id = $1`, [noteId])).rows[0] as
        | Record<string, unknown>
        | undefined;
    }

    await client.query("COMMIT");

    if (kind === "credit") {
      await recordAuditLog({
        orgId,
        actor,
        action: "update",
        module: "credit-notes",
        entityId: noteId,
        entityLabel: auditNewRow ? String(auditNewRow[numberField] ?? "") : null,
        oldData: auditOldRow ?? null,
        newData: auditNewRow ?? null,
      });
    }

    return { ok: true, id: noteId };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return { ok: false, error: "Could not void this document.", status: 500 };
  } finally {
    client.release();
  }
}
