import { pool, query, queryOne } from "@/lib/db";
import type { DocumentConfig } from "@/lib/documents";
import { docNumber } from "@/lib/ids";
import { getOrCreateNumberSeries, claimNextNumber } from "@/lib/number-series";
import { syncInvoiceJournal, syncBillJournal } from "@/lib/auto-journal";

// Shared create/update logic for every "document" entity (quotes, invoices, bills, sales
// orders — anything registered in src/lib/documents.ts): header + line items in one
// transaction, with tax computed from a flat percentage and (for invoices only) the
// auto-journal kept in sync. Originally lived inline in /api/documents/[entity]/route.ts and
// its [id] sibling; pulled out here so the third-party REST API (/api/v1/invoices,
// /api/v1/sales-orders) can call the exact same logic as the app's own session-authenticated
// routes instead of re-implementing it — one place to fix if the rules ever change.

export interface DocumentBody {
  header?: Record<string, unknown>;
  lines?: { item_id?: string | null; description?: string; quantity?: number; rate?: number; discount_percent?: number }[];
  taxPercent?: number;
}

export interface DocumentActionResult {
  ok: boolean;
  id?: string;
  error?: string;
  status?: number;
}

export async function listDocuments(cfg: DocumentConfig, orgId: string, opts: { limit?: number; offset?: number } = {}) {
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 50), 1), 200);
  const offset = Math.max(Math.trunc(opts.offset ?? 0), 0);
  return query(
    `SELECT * FROM ${cfg.headerTable} WHERE organization_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [orgId, limit, offset]
  );
}

export async function getDocument(cfg: DocumentConfig, orgId: string, id: string) {
  const header = await queryOne(`SELECT * FROM ${cfg.headerTable} WHERE organization_id = $1 AND id = $2`, [orgId, id]);
  if (!header) return null;
  const lines = await query(`SELECT * FROM ${cfg.itemsTable} WHERE ${cfg.parentField} = $1 ORDER BY id`, [id]);
  const subtotal = Number((header as Record<string, unknown>).subtotal ?? 0);
  const taxTotal = Number((header as Record<string, unknown>).tax_total ?? 0);
  const taxPercent = subtotal > 0 ? Math.round((taxTotal / subtotal) * 10000) / 100 : 0;
  return { header, lines, taxPercent };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function lineAmount(cfg: DocumentConfig, line: { quantity?: number; rate?: number; discount_percent?: number }) {
  const gross = Number(line.quantity ?? 0) * Number(line.rate ?? 0);
  if (!cfg.hasLineDiscount) return gross;
  const discount = Math.min(Math.max(Number(line.discount_percent ?? 0), 0), 100);
  return Math.round(gross * (1 - discount / 100) * 100) / 100;
}

export async function createDocument(cfg: DocumentConfig, orgId: string, body: DocumentBody): Promise<DocumentActionResult> {
  const lines = (body.lines ?? []).filter((l) => (l.description || l.item_id) && Number(l.quantity) > 0);
  const subtotal = lines.reduce((sum, l) => sum + lineAmount(cfg, l), 0);
  const taxPercent = Number(body.taxPercent ?? 0);
  const taxTotal = Math.round(subtotal * (taxPercent / 100) * 100) / 100;
  const total = subtotal + taxTotal;

  let number = body.header?.[cfg.numberField] as string | undefined;
  if (!number && cfg.numberSeriesKey) {
    const series = await getOrCreateNumberSeries(orgId, cfg.numberSeriesKey);
    if (series.mode === "manual") {
      const label = cfg.numberField.replace(/_/g, " ");
      return { ok: false, error: `${label.charAt(0).toUpperCase()}${label.slice(1)} is required.`, status: 400 };
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (!number) {
      number = cfg.numberSeriesKey
        ? await claimNextNumber(client, orgId, cfg.numberSeriesKey)
        : docNumber(cfg.numberPrefix);
    }

    const hasBalanceDue = cfg.key === "invoices" || cfg.key === "bills";
    const extraFields = cfg.extraHeaderFields ?? [];
    const columns = [
      "organization_id",
      cfg.numberField,
      cfg.partyField,
      cfg.dateField,
      ...(cfg.secondDateField ? [cfg.secondDateField] : []),
      "status",
      "notes",
      "subtotal",
      "tax_total",
      "total",
      ...(hasBalanceDue ? ["balance_due"] : []),
      ...extraFields,
    ];
    // Paid / Partially Paid can never be a legitimate STARTING status — nothing has been
    // collected/paid against a brand-new document yet, so a client sending one (bypassing the
    // UI, which no longer offers them for invoices or bills — see entities.ts) is ignored in
    // favor of the normal default rather than trusted at face value.
    const requestedStatus = String(body.header?.status || "draft");
    const initialStatus =
      (cfg.key === "invoices" || cfg.key === "bills") && (requestedStatus === "paid" || requestedStatus === "partially_paid")
        ? "draft"
        : requestedStatus;
    const values: unknown[] = [
      orgId,
      number,
      body.header?.[cfg.partyField] || null,
      body.header?.[cfg.dateField] || new Date().toISOString().slice(0, 10),
      ...(cfg.secondDateField ? [body.header?.[cfg.secondDateField] || null] : []),
      initialStatus,
      body.header?.notes || null,
      subtotal,
      taxTotal,
      total,
      ...(hasBalanceDue ? [total] : []),
      ...extraFields.map((f) => body.header?.[f] || null),
    ];
    const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
    const headerResult = await client.query(
      `INSERT INTO ${cfg.headerTable} (${columns.join(", ")}) VALUES (${placeholders}) RETURNING id`,
      values
    );
    const headerId = headerResult.rows[0].id;

    for (const line of lines) {
      const amount = lineAmount(cfg, line);
      if (cfg.hasLineDiscount) {
        await client.query(
          `INSERT INTO ${cfg.itemsTable} (${cfg.parentField}, item_id, description, quantity, rate, discount_percent, amount)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            headerId,
            line.item_id || null,
            line.description || null,
            line.quantity ?? 0,
            line.rate ?? 0,
            Math.min(Math.max(Number(line.discount_percent ?? 0), 0), 100),
            amount,
          ]
        );
      } else {
        await client.query(
          `INSERT INTO ${cfg.itemsTable} (${cfg.parentField}, item_id, description, quantity, rate, amount)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [headerId, line.item_id || null, line.description || null, line.quantity ?? 0, line.rate ?? 0, amount]
        );
      }
    }

    if (cfg.key === "invoices") {
      await syncInvoiceJournal(client, orgId, headerId);
    } else if (cfg.key === "bills") {
      await syncBillJournal(client, orgId, headerId);
    }

    await client.query("COMMIT");
    return { ok: true, id: headerId };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return { ok: false, error: "Could not save document.", status: 500 };
  } finally {
    client.release();
  }
}

export async function updateDocument(
  cfg: DocumentConfig,
  orgId: string,
  id: string,
  body: DocumentBody
): Promise<DocumentActionResult> {
  const hasBalanceDue = cfg.key === "invoices" || cfg.key === "bills";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // A true partial update: lock and read the current row first, so any header field or
    // "lines" left out of the request body keeps its existing value instead of getting
    // overwritten with null/zero. The app's own edit forms always send every field (so this
    // is a no-op behavior change for them), but a third-party PATCH call — the whole point of
    // exposing this over /api/v1 — has every reason to send only what actually changed, and
    // silently wiping the line items or clobbering a NOT NULL date column when it does is a
    // real correctness bug, not just an inconvenience.
    const currentResult = await client.query(
      `SELECT * FROM ${cfg.headerTable} WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
      [orgId, id]
    );
    const current = currentResult.rows[0];
    if (!current) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Not found", status: 404 };
    }

    const linesProvided = body.lines !== undefined;
    let subtotal = Number(current.subtotal);
    let taxTotal = Number(current.tax_total);
    let total = Number(current.total);
    const lines = linesProvided ? (body.lines ?? []).filter((l) => (l.description || l.item_id) && Number(l.quantity) > 0) : [];

    if (linesProvided) {
      subtotal = lines.reduce((sum, l) => sum + lineAmount(cfg, l), 0);
      const taxPercent = Number(body.taxPercent ?? 0);
      taxTotal = Math.round(subtotal * (taxPercent / 100) * 100) / 100;
      total = subtotal + taxTotal;
    } else if (body.taxPercent !== undefined) {
      // Tax rate changed without touching the line items — recompute against the existing subtotal.
      const taxPercent = Number(body.taxPercent);
      taxTotal = Math.round(subtotal * (taxPercent / 100) * 100) / 100;
      total = subtotal + taxTotal;
    }

    const setParts: string[] = [];
    const values: unknown[] = [orgId, id];
    let idx = values.length;
    function setField(column: string, value: unknown) {
      idx += 1;
      setParts.push(`${column} = $${idx}`);
      values.push(value);
    }

    if (body.header && cfg.partyField in body.header) setField(cfg.partyField, body.header[cfg.partyField] || null);
    if (body.header && cfg.dateField in body.header) setField(cfg.dateField, body.header[cfg.dateField] || current[cfg.dateField]);
    if (cfg.secondDateField && body.header && cfg.secondDateField in body.header) {
      setField(cfg.secondDateField, body.header[cfg.secondDateField] || null);
    }
    if (body.header && "status" in body.header) {
      const requestedStatus = String(body.header.status || "draft");
      // Paid / Partially Paid are only ever set by the payment-allocation flow (receipts-api.ts
      // for invoices; recomputeBillBalance in auto-journal.ts, via a Payment Made, for bills)
      // — see the matching comment in createDocument. The app's own edit form always resubmits
      // whatever status was already showing (including these two, since removing them from the
      // dropdown's *options* doesn't clear the form's internal state — see entities.ts), so this
      // has to distinguish "resubmitting the unchanged value" (harmless, allow it through) from
      // "trying to newly set it" (blocked) by comparing against what's actually in the database.
      const blockedTransition =
        (cfg.key === "invoices" || cfg.key === "bills") &&
        (requestedStatus === "paid" || requestedStatus === "partially_paid") &&
        requestedStatus !== current.status;
      if (!blockedTransition) setField("status", requestedStatus || "draft");
    }
    if (body.header && "notes" in body.header) setField("notes", body.header.notes || null);
    for (const f of cfg.extraHeaderFields ?? []) {
      if (body.header && f in body.header) setField(f, body.header[f] || null);
    }
    if (linesProvided || body.taxPercent !== undefined) {
      setField("subtotal", subtotal);
      setField("tax_total", taxTotal);
      setField("total", total);
      if (hasBalanceDue) {
        // Re-base balance_due against the new total rather than resetting it outright: any
        // amount already collected (via payments) or adjusted (via credit/debit notes) is the
        // gap between the CURRENT total and CURRENT balance_due, and that gap should survive
        // an unrelated edit (fixing a typo, editing a line description) — otherwise every save
        // through the app's own edit form, which always resends the full line list, would
        // silently wipe out prior payments by resetting balance_due back to the full total.
        const alreadyApplied = Math.max(0, round2(Number(current.total) - Number(current.balance_due)));
        setField("balance_due", Math.max(0, round2(total - alreadyApplied)));
      }
    }

    if (setParts.length > 0) {
      await client.query(`UPDATE ${cfg.headerTable} SET ${setParts.join(", ")} WHERE organization_id = $1 AND id = $2`, values);
    }

    if (linesProvided) {
      await client.query(`DELETE FROM ${cfg.itemsTable} WHERE ${cfg.parentField} = $1`, [id]);
      for (const line of lines) {
        const amount = lineAmount(cfg, line);
        if (cfg.hasLineDiscount) {
          await client.query(
            `INSERT INTO ${cfg.itemsTable} (${cfg.parentField}, item_id, description, quantity, rate, discount_percent, amount)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              id,
              line.item_id || null,
              line.description || null,
              line.quantity ?? 0,
              line.rate ?? 0,
              Math.min(Math.max(Number(line.discount_percent ?? 0), 0), 100),
              amount,
            ]
          );
        } else {
          await client.query(
            `INSERT INTO ${cfg.itemsTable} (${cfg.parentField}, item_id, description, quantity, rate, amount)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [id, line.item_id || null, line.description || null, line.quantity ?? 0, line.rate ?? 0, amount]
          );
        }
      }
    }

    if (cfg.key === "invoices") {
      await syncInvoiceJournal(client, orgId, id);
    } else if (cfg.key === "bills") {
      await syncBillJournal(client, orgId, id);
    }

    await client.query("COMMIT");
    return { ok: true, id };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return { ok: false, error: "Could not update document.", status: 500 };
  } finally {
    client.release();
  }
}
