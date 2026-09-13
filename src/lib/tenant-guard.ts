import { pool } from "@/lib/db";

// Closes the other half of this app's tenant isolation. Every write path already scopes a
// row's OWN organization_id correctly (createRow/updateRow, the documents/bills/vendor-credit
// APIs, etc. all filter and stamp organization_id from the trusted session/API-key context).
// What none of them checked is the org-scoping of what a foreign-key reference field POINTS
// TO — account_id, customer_id, vendor_id, item_id, project_id, unit_id, and similar
// client-submitted ids. loadRefOptions (crud.ts) already scopes the DROPDOWN OPTIONS a user
// is shown to their own org, but nothing re-validated the actual submitted value at write
// time — a direct API/PATCH call (or a user who is a member of more than one organization)
// could attribute a transaction to another organization's account, customer, vendor,
// project, etc., corrupting that other organization's reports or leaking its data into their
// own. Table names passed in here always come from the static entity registry or a fixed
// literal in this codebase (never from request input), matching the existing convention in
// crud.ts — only values are ever parameterized.

/**
 * True if a row with this id exists in `table` and belongs to `orgId`. An empty/absent id is
 * treated as valid (nothing to check) since almost every one of these reference fields is
 * optional — required-ness is validated separately by each caller.
 */
export async function idBelongsToOrg(table: string, id: unknown, orgId: string): Promise<boolean> {
  if (id === null || id === undefined || id === "") return true;
  try {
    const result = await pool.query(`SELECT 1 FROM ${table} WHERE id = $1::uuid AND organization_id = $2`, [
      String(id),
      orgId,
    ]);
    return (result.rowCount ?? 0) > 0;
  } catch {
    // A malformed id (not even a valid UUID) is never a valid same-org reference.
    return false;
  }
}

/**
 * Same check for a batch of ids at once (e.g. every line item's item_id on a document) — one
 * query instead of one per id. Every distinct, non-empty id in the batch must belong to
 * `orgId` or the whole batch is rejected.
 */
export async function idsBelongToOrg(table: string, ids: unknown[], orgId: string): Promise<boolean> {
  const cleaned = [...new Set(ids.filter((v) => v !== null && v !== undefined && v !== "").map((v) => String(v)))];
  if (cleaned.length === 0) return true;
  try {
    const result = await pool.query(`SELECT id FROM ${table} WHERE organization_id = $1 AND id = ANY($2::uuid[])`, [
      orgId,
      cleaned,
    ]);
    return result.rowCount === cleaned.length;
  } catch {
    return false;
  }
}

export interface JournalLineRef {
  account_id?: string | null;
  contact_type?: string | null;
  contact_id?: string | null;
}

/**
 * Validates every manual-journal line's account_id (always) and contact_id (scoped by its own
 * contact_type — "customer" or "vendor") against the org the journal is being saved under.
 * /api/journals is the one place in the app where a user types in a raw account_id/contact_id
 * directly rather than going through an already-validated document field — every other
 * journal-producing flow (invoices, bills, payments, ...) derives its accounts from those
 * instead. Returns an error string for the first invalid reference found, or null when every
 * line checks out.
 */
export async function validateJournalLineRefs(lines: JournalLineRef[], orgId: string): Promise<string | null> {
  const accountIds = lines.map((l) => l.account_id).filter(Boolean);
  if (accountIds.length > 0 && !(await idsBelongToOrg("accounts", accountIds, orgId))) {
    return "One or more selected Accounts are invalid.";
  }
  const customerIds = lines.filter((l) => l.contact_type === "customer").map((l) => l.contact_id).filter(Boolean);
  if (customerIds.length > 0 && !(await idsBelongToOrg("customers", customerIds, orgId))) {
    return "One or more selected Customer contacts are invalid.";
  }
  const vendorIds = lines.filter((l) => l.contact_type === "vendor").map((l) => l.contact_id).filter(Boolean);
  if (vendorIds.length > 0 && !(await idsBelongToOrg("vendors", vendorIds, orgId))) {
    return "One or more selected Vendor contacts are invalid.";
  }
  return null;
}
