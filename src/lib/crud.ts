import { pool, query, queryOne } from "@/lib/db";
import { getEntity, type EntityDef } from "@/lib/entities";
import { claimNextNumber } from "@/lib/number-series";

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

export async function createRow(entityKey: string, orgId: string, input: Record<string, unknown>) {
  const entity = getEntity(entityKey);
  if (!entity) throw new Error(`Unknown entity ${entityKey}`);
  const data = buildInsertData(entity, input);

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
      return result.rows[0];
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
  return row;
}

export async function updateRow(
  entityKey: string,
  orgId: string,
  id: string,
  input: Record<string, unknown>
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
  const setClauses = keys.map((k, i) => `${k} = $${i + 3}`).join(", ");
  const values = [orgId, id, ...keys.map((k) => data[k])];
  const row = await queryOne(
    `UPDATE ${entity.table} SET ${setClauses} WHERE organization_id = $1 AND id = $2 RETURNING *`,
    values
  );
  return row;
}

export async function deleteRow(entityKey: string, orgId: string, id: string) {
  const entity = getEntity(entityKey);
  if (!entity) throw new Error(`Unknown entity ${entityKey}`);
  await pool.query(`DELETE FROM ${entity.table} WHERE organization_id = $1 AND id = $2`, [orgId, id]);
}

export interface Membership {
  organizationId: string;
  organizationName: string;
  role: string;
}

/** For select-type fields backed by another entity, load {value,label} options scoped to the org. */
export async function loadRefOptions(entity: EntityDef, orgId: string, memberships: Membership[] = []) {
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
    const rows = await query<Record<string, unknown>>(
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
