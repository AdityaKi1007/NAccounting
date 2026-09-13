import { pool } from "@/lib/db";

// Shared audit-trail writer for the entities the account owner asked to have audited:
// Invoices, Receipts (Payments Received), Customers, Vendors, Credit Notes (Credit Memos),
// Purchase Orders, Bills, Payments Made, Bank Accounts, Projects and Units. Called from every
// code path that can create/update/delete one of those entities:
//
//   - src/lib/crud.ts (createRow/updateRow/deleteRow) — generic-CRUD entities: vendors,
//     bank-accounts, projects, inventory (Units), and (only for the v1 API's create/update,
//     which write through this same generic path) customers and payments-received/
//     payments-made. See AUDITED_MODULES below for the exact filtered set — crud.ts serves
//     ~20 entity types in total, most of which are intentionally NOT audited.
//   - src/lib/documents-api.ts (createDocument/updateDocument) — invoices, bills,
//     purchase-orders (filtered from the full documentConfigs set, which also covers quotes
//     and sales-orders — not requested, not audited).
//   - src/app/api/documents/[entity]/[id]/route.ts's DELETE handler directly (documents have
//     no shared deleteDocument() to hook — that route does the DELETE itself).
//   - src/lib/receipts-api.ts (createReceipt/updateReceiptMeta) — Receipts.
//   - src/lib/payments-made-api.ts (createPaymentMade) — Payments Made.
//   - src/lib/bills-api.ts (createBill/updateBill) — Bills' own real create/update path
//     (documents-api.ts's generic path also exists for Bills but isn't what the app actually
//     uses — both are hooked so neither silently goes unaudited).
//   - src/lib/credit-debit-notes-api.ts (createCreditOrDebitNote/voidCreditOrDebitNote),
//     filtered to kind === "credit" only — Debit Notes were never part of this request.
//   - src/app/api/customers/route.ts + [id]/route.ts directly — the app-UI's own bespoke
//     customer create/update/delete, which never goes through crud.ts at all.
//
// Deliberately NOT covered: every other generic-CRUD entity (tax rates, currencies, items,
// chart of accounts, manual journals, expenses, vendor credits, quotes, sales orders,
// delivery challans, ...), refunds, and any action that isn't itself a create/update/delete of
// one of the eleven audited entities (e.g. emailing a document, converting a quote). Scoped
// this way deliberately, per the account owner's own list of what to audit.

export type AuditAction = "create" | "update" | "delete";

/** Who made the change: a signed-in user for session-authenticated routes, or the API key
 * used for a third-party /api/v1 call (never both — a request is authenticated one way or the
 * other). Both null is valid too (e.g. a system-triggered write with no caller identity to
 * attach), though every current call site has one or the other. */
export interface AuditActor {
  userId?: string | null;
  apiKeyId?: string | null;
}

/** Human-readable labels for the `module` column, shown in the Audit Logs UI. Keyed by the
 * same entity key used everywhere else in the codebase (entities.ts / documentConfigs). */
export const AUDIT_MODULE_LABELS: Record<string, string> = {
  invoices: "Invoices",
  "payments-received": "Receipts",
  customers: "Customers",
  vendors: "Vendors",
  "credit-notes": "Credit Notes",
  "purchase-orders": "Purchase Orders",
  bills: "Bills",
  "payments-made": "Payments Made",
  "bank-accounts": "Banking",
  projects: "Projects",
  inventory: "Units",
};

export const AUDITED_MODULES = Object.keys(AUDIT_MODULE_LABELS);

// Columns that exist on virtually every audited table but are pure bookkeeping, not a change
// a person made — comparing them would make every single update's changed_fields list include
// noise like "updated_at" (on tables that have one) even when nothing the user actually
// touched changed. organization_id is excluded too: it's effectively immutable in practice
// (the one entity where it's a real editable field, Projects, reassigning it is itself a
// meaningful change worth keeping, but it's rare enough that the extra noise isn't worth a
// special case here — left in deliberately).
const DIFF_IGNORE_FIELDS = new Set(["updated_at", "created_at"]);

/** Field-by-field diff between an old and new row, JSON-normalized so a numeric column coming
 * back as the string "100.00" from pg vs. the number 100 in freshly-built insert data doesn't
 * falsely show up as "changed". Returns the sorted list of field names that actually differ. */
export function diffChangedFields(
  oldData: Record<string, unknown> | null | undefined,
  newData: Record<string, unknown> | null | undefined
): string[] {
  if (!oldData || !newData) return [];
  const fields = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  const changed: string[] = [];
  for (const field of fields) {
    if (DIFF_IGNORE_FIELDS.has(field)) continue;
    const a = normalize(oldData[field]);
    const b = normalize(newData[field]);
    if (a !== b) changed.push(field);
  }
  return changed.sort();
}

function normalize(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    // A numeric-looking string (postgres returns numeric/currency columns as strings, e.g.
    // "100.00") normalizes the same way a real number would, so "100" and 100 and "100.00"
    // all compare equal.
    const n = Number(value);
    if (value.trim() !== "" && Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(value.trim())) {
      return String(n);
    }
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}

export interface RecordAuditLogInput {
  orgId: string;
  actor: AuditActor;
  action: AuditAction;
  module: string;
  entityId: string | null;
  entityLabel: string | null;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
}

/**
 * Writes one audit_log row. Best-effort: a failure here is logged to the server console but
 * never thrown — an audit trail write going wrong must never take down the actual create/
 * update/delete it's describing (same "fire-and-forget, but awaited so ordering is
 * deterministic" convention already used for API-key usage stats — see api-context.ts).
 *
 * Silently skips writing anything for an 'update' whose changed_fields comes back empty (both
 * rows given, genuinely nothing differed after normalization) — an audit log entry that says
 * "nothing changed" isn't useful and would just be noise every time a form is saved unchanged.
 * 'create' and 'delete' always write (there's always something to record either way).
 */
export async function recordAuditLog(input: RecordAuditLogInput): Promise<void> {
  try {
    let changedFields: string[] | null = null;
    if (input.action === "update") {
      changedFields = diffChangedFields(input.oldData, input.newData);
      if (changedFields.length === 0) return;
    }

    await pool.query(
      `INSERT INTO audit_log
         (organization_id, user_id, api_key_id, action, module, entity_id, entity_label, old_data, new_data, changed_fields)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        input.orgId,
        input.actor.userId ?? null,
        input.actor.apiKeyId ?? null,
        input.action,
        input.module,
        input.entityId,
        input.entityLabel,
        input.oldData ? JSON.stringify(input.oldData) : null,
        input.newData ? JSON.stringify(input.newData) : null,
        changedFields ? JSON.stringify(changedFields) : null,
      ]
    );
  } catch (err) {
    console.error("Failed to write audit log", { module: input.module, action: input.action }, err);
  }
}
