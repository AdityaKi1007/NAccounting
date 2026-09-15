import { pool, query, queryOne } from "@/lib/db";
import { getEntity, type EntityDef } from "@/lib/entities";
import { claimNextNumber } from "@/lib/number-series";
import { idBelongsToOrg } from "@/lib/tenant-guard";
import { recordAuditLog, AUDITED_MODULES, type AuditActor } from "@/lib/audit-log";

// entityKeys from AUDITED_MODULES that this generic CRUD layer itself ever actually writes —
// customers/payments-received/payments-made are in AUDITED_MODULES too, but only their v1 API
// create/update goes through createRow/updateRow (their app-UI paths and receipts/payments-made
// creation are bespoke — see audit-log.ts's own comment for the full call-site map); their
// deletes DO go through here (deleteRow), which is why they're included in this set rather
// than left out entirely.
const CRUD_AUDITED_MODULES = new Set(AUDITED_MODULES);

function entityLabelOf(entity: EntityDef, row: Record<string, unknown> | null | undefined): string | null {
  if (!row) return null;
  const value = row[entity.titleField ?? "id"];
  return value === null || value === undefined ? null : String(value);
}

// Column/table names here always come from the static entity registry (never from
// request input), so building SQL by interpolating them is safe. Only values are
// parameterized.

export async function listRows(entityKey: string, orgId: string) {
  const entity = getEntity(entityKey);
  if (!entity) throw new Error(`Unknown entity ${entityKey}`);
  const orderBy = entity.orderBy ?? "created_at desc";
  // Manual Journals is for journals a person creates by hand; entries auto-generated from an
  // invoice or payment (see src/lib/auto-journal.ts) live only under that document's own
  // Journal panel, not in this list — editing or deleting them here would desync them from
  // the transaction that owns them.
  const extraWhere = entityKey === "manual-journals" ? "AND invoice_id IS NULL AND payment_id IS NULL" : "";
  const rows = await query(
    `SELECT * FROM ${entity.table} WHERE organization_id = $1 ${extraWhere} ORDER BY ${orderBy}`,
    [orgId]
  );
  return rows;
}

export async function getRow(entityKey: string, orgId: string, id: string) {
  const entity = getEntity(entityKey);
  if (!entity) throw new Error(`Unknown entity ${entityKey}`);
  return queryOne(
    `SELECT * FROM ${entity.table} WHERE organization_id = $1 AND id = $2`,
    [orgId, id]
  );
}

function coerceValue(type: string, raw: unknown) {
  if (raw === undefined || raw === null || raw === "") {
    if (type === "boolean") return false;
    if (type === "number" || type === "currency") return null;
    return null;
  }
  if (type === "boolean") return raw === true || raw === "true" || raw === "on";
  if (type === "number" || type === "currency") {
    const n = typeof raw === "number" ? raw : parseFloat(String(raw));
    return Number.isFinite(n) ? n : null;
  }
  return raw;
}

export function buildInsertData(entity: EntityDef, input: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const field of entity.fields) {
    // organization_id is normally just the automatic tenancy column every table has — but on
    // an entity like Projects it's also a real, editable field (see entities.ts). Either way
    // createRow below always supplies it itself (as the first INSERT column, using whatever
    // org id the caller resolved via resolveOrgIdForWrite), so including it here too would
    // insert the same column twice and error.
    if (field.name === "organization_id") continue;
    let value = coerceValue(field.type, input[field.name]);
    if ((value === null || value === undefined) && field.default !== undefined) {
      value = field.default;
    }
    data[field.name] = value;
  }
  // The number field's own auto-fill (when left blank) is handled by createRow below, via the
  // org's real sequential number_series — not here, since claiming a number has to happen
  // inside the same transaction as the row insert (see createRow).
  return data;
}

export async function createRow(
  entityKey: string,
  orgId: string,
  input: Record<string, unknown>,
  actor: AuditActor = {}
) {
  const entity = getEntity(entityKey);
  if (!entity) throw new Error(`Unknown entity ${entityKey}`);
  const data = buildInsertData(entity, input);
  const audited = CRUD_AUDITED_MODULES.has(entityKey);

  // A record type with its own sequential numbering (Delivery Challans, Payments Made,
  // Vendor Credits, and any future "flat" entity with a numberField — see
  // src/lib/number-series.ts's DEFAULT_PREFIXES) claims its number from the org's
  // Transaction Number Series settings when the field was left blank, exactly like
  // invoices/quotes/sales orders/etc. already do via documents-api.ts. Claiming has to run
  // in the same transaction as the insert so a crashed insert never burns a number.
  if (entity.numberField && (!data[entity.numberField] || data[entity.numberField] === "")) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      data[entity.numberField] = await claimNextNumber(client, orgId, entityKey);
      const columns = ["organization_id", ...Object.keys(data)];
      const values = [orgId, ...Object.values(data)];
      const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
      const result = await client.query(
        `INSERT INTO ${entity.table} (${columns.join(", ")}) VALUES (${placeholders}) RETURNING *`,
        values
      );
      await client.query("COMMIT");
      const row = result.rows[0];
      if (audited) {
        await recordAuditLog({
          orgId,
          actor,
          action: "create",
          module: entityKey,
          entityId: (row as { id?: string })?.id ?? null,
          entityLabel: entityLabelOf(entity, row),
          oldData: null,
          newData: row,
        });
      }
      return row;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  const columns = ["organization_id", ...Object.keys(data)];
  const values = [orgId, ...Object.values(data)];
  const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
  const row = await queryOne(
    `INSERT INTO ${entity.table} (${columns.join(", ")}) VALUES (${placeholders}) RETURNING *`,
    values
  );
  if (audited && row) {
    await recordAuditLog({
      orgId,
      actor,
      action: "create",
      module: entityKey,
      entityId: (row as { id?: string })?.id ?? null,
      entityLabel: entityLabelOf(entity, row as Record<string, unknown>),
      oldData: null,
      newData: row as Record<string, unknown>,
    });
  }
  return row;
}

export async function updateRow(
  entityKey: string,
  orgId: string,
  id: string,
  input: Record<string, unknown>,
  actor: AuditActor = {}
) {
  const entity = getEntity(entityKey);
  if (!entity) throw new Error(`Unknown entity ${entityKey}`);
  const data: Record<string, unknown> = {};
  for (const field of entity.fields) {
    if (field.name in input) {
      data[field.name] = coerceValue(field.type, input[field.name]);
    }
  }
  const keys = Object.keys(data);
  if (keys.length === 0) return getRow(entityKey, orgId, id);

  const audited = CRUD_AUDITED_MODULES.has(entityKey);
  // Fetched only for audited entities — an extra SELECT on every generic-CRUD update
  // (tax rates, currencies, items, ...) for a diff nobody will ever read isn't worth the cost.
  const before = audited ? await getRow(entityKey, orgId, id) : null;

  const setClauses = keys.map((k, i) => `${k} = $${i + 3}`).join(", ");
  const values = [orgId, id, ...keys.map((k) => data[k])];
  const row = await queryOne(
    `UPDATE ${entity.table} SET ${setClauses} WHERE organization_id = $1 AND id = $2 RETURNING *`,
    values
  );
  if (audited && row) {
    await recordAuditLog({
      orgId,
      actor,
      action: "update",
      module: entityKey,
      entityId: (row as { id?: string })?.id ?? id,
      entityLabel: entityLabelOf(entity, row as Record<string, unknown>),
      oldData: before as Record<string, unknown> | null,
      newData: row as Record<string, unknown>,
    });
  }
  return row;
}

export async function deleteRow(entityKey: string, orgId: string, id: string, actor: AuditActor = {}) {
  const entity = getEntity(entityKey);
  if (!entity) throw new Error(`Unknown entity ${entityKey}`);
  const audited = CRUD_AUDITED_MODULES.has(entityKey);
  const result = await pool.query(
    `DELETE FROM ${entity.table} WHERE organization_id = $1 AND id = $2 RETURNING *`,
    [orgId, id]
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (audited && row) {
    await recordAuditLog({
      orgId,
      actor,
      action: "delete",
      module: entityKey,
      entityId: (row.id as string) ?? id,
      entityLabel: entityLabelOf(entity, row),
      oldData: row,
      newData: null,
    });
  }
}

export interface Membership {
  organizationId: string;
  organizationName: string;
  role: string;
}

/** For select-type fields backed by another entity, load {value,label} options scoped to the
 * org. `excludeId` — the id of the record currently being edited, if any — is left out of
 * every field's option list. This only ever matters for a self-referencing field (a refEntity
 * pointing back at its own entity, e.g. Chart of Accounts' Parent Account); for every other
 * field it's a no-op, since a record's own id essentially never coincides with a row in some
 * unrelated referenced table. Without this, editing a Chart of Accounts entry would offer that
 * same account as a candidate for its own Parent Account. */
export async function loadRefOptions(entity: EntityDef, orgId: string, memberships: Membership[] = [], excludeId?: string) {
  const refFields = entity.fields.filter((f) => f.type === "select" && f.refEntity);
  const result: Record<string, { value: string; label: string }[]> = {};
  for (const field of refFields) {
    // The organizations table IS the tenancy root — it has no organization_id column of its
    // own, so it can't go through the generic "WHERE organization_id = $1" query below.
    // Source its options from the caller's own memberships instead (the same authoritative,
    // unspoofable list session.ts/api-context.ts compute from org_members), so a user only
    // ever sees — and can only ever pick — an organization they actually belong to.
    if (field.refEntity === "organizations") {
      result[field.name] = memberships
        .map((m) => ({ value: m.organizationId, label: m.organizationName }))
        .sort((a, b) => a.label.localeCompare(b.label));
      continue;
    }
    const refEntity = getEntity(field.refEntity as string);
    if (!refEntity) continue;
    const labelField = field.refLabelField ?? refEntity.titleField;
    const rows = excludeId
      ? await query<Record<string, unknown>>(
          `SELECT id, ${labelField} FROM ${refEntity.table} WHERE organization_id = $1 AND id != $2 ORDER BY ${labelField} ASC`,
          [orgId, excludeId]
        )
      : await query<Record<string, unknown>>(
          `SELECT id, ${labelField} FROM ${refEntity.table} WHERE organization_id = $1 ORDER BY ${labelField} ASC`,
          [orgId]
        );
    result[field.name] = rows.map((r) => ({
      value: String(r.id),
      label: String(r[labelField] ?? ""),
    }));
  }
  return result;
}

/**
 * Validates a submitted organization_id (for an entity that has one as a real, editable
 * field — currently only Projects) against the user's actual memberships, before it's ever
 * allowed to reach an INSERT or UPDATE. Without this, a direct API call could move or create
 * a record under an organization the caller doesn't belong to at all.
 *
 * Returns { valid: true, orgId } with the resolved org id to actually write (falls back to
 * the current org when the field is absent from input, e.g. an edit that doesn't touch it),
 * or { valid: false } when the submitted id isn't one of the caller's real memberships.
 * Entities without an organization_id field always resolve to the current org unchanged.
 */
/**
 * Validates every refEntity-typed field actually present in `input` against the org the row
 * will be written under — the write-time counterpart to loadRefOptions' org-scoped dropdown
 * options above. Without this, createRow/updateRow would happily insert a client-submitted
 * account_id, customer_id, vendor_id, project_id, item_id, etc. that belongs to a DIFFERENT
 * organization: only the row's own organization_id was ever protected, not the org-scoping of
 * what its reference fields point to. "organizations" is skipped here — that field is a
 * membership choice already validated by resolveOrgIdForWrite above, not a same-org lookup.
 * Called explicitly by each route handler (mirroring resolveOrgIdForWrite's own calling
 * convention) rather than baked into createRow/updateRow, so a bulk importer that already
 * resolves references safely by name isn't forced through an extra DB round trip per field.
 */
export async function validateRefFields(
  entityKey: string,
  orgId: string,
  input: Record<string, unknown>,
  // The id of the record being updated, if this is an edit (never set on create — a record
  // can't reference itself before it exists). Only meaningful for a self-referencing field
  // (a refEntity pointing back at its own entity, e.g. Chart of Accounts' Parent Account) —
  // rejects a direct API call that tries to set a record as its own parent, the server-side
  // backstop to loadRefOptions already excluding it from the dropdown's own option list.
  currentId?: string
): Promise<{ valid: true } | { valid: false; error: string }> {
  const entity = getEntity(entityKey);
  if (!entity) return { valid: true };
  const refFields = entity.fields.filter((f) => f.type === "select" && f.refEntity && f.refEntity !== "organizations");
  for (const field of refFields) {
    if (!(field.name in input)) continue;
    const value = input[field.name];
    if (value === undefined || value === null || value === "") continue;
    if (currentId && field.refEntity === entityKey && String(value) === currentId) {
      return { valid: false, error: `${field.label} can't reference itself.` };
    }
    const refEntity = getEntity(field.refEntity as string);
    if (!refEntity) continue;
    const ok = await idBelongsToOrg(refEntity.table, value, orgId);
    if (!ok) return { valid: false, error: `Select a valid ${field.label}.` };
  }
  return { valid: true };
}

export function resolveOrgIdForWrite(
  entity: EntityDef,
  currentOrgId: string,
  input: Record<string, unknown>,
  memberships: Membership[]
): { valid: true; orgId: string } | { valid: false; orgId?: undefined } {
  const hasOrgField = entity.fields.some((f) => f.name === "organization_id");
  if (!hasOrgField) return { valid: true, orgId: currentOrgId };

  const submitted = input.organization_id;
  if (submitted === undefined || submitted === null || submitted === "") {
    return { valid: true, orgId: currentOrgId };
  }
  const ok = memberships.some((m) => m.organizationId === String(submitted));
  if (!ok) return { valid: false };
  return { valid: true, orgId: String(submitted) };
}
