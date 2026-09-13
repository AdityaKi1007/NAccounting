import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getEntity } from "@/lib/entities";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { moduleAccessErrorResponse } from "@/lib/module-access";
import { idBelongsToOrg } from "@/lib/tenant-guard";

const ALLOWED_ENTITIES = ["items", "customers", "vendors"];

export async function POST(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const bulkUpdateAccessError = await moduleAccessErrorResponse(ctx, "bulk-update", "write");
  if (bulkUpdateAccessError) return bulkUpdateAccessError;

  const body = await req.json().catch(() => ({}));
  const { entityKey, ids, field, value } = body as {
    entityKey: string;
    ids: string[];
    field: string;
    value: unknown;
  };

  if (!ALLOWED_ENTITIES.includes(entityKey)) {
    return NextResponse.json({ error: "Bulk update is not supported for this list." }, { status: 400 });
  }
  // Bulk-updating a target list (e.g. Customers) still needs write access to that module
  // itself — Bulk Update is a shortcut into the same data, not a way around its own gate.
  const targetAccessError = await moduleAccessErrorResponse(ctx, entityKey, "write");
  if (targetAccessError) return targetAccessError;
  const entity = getEntity(entityKey);
  const fieldDef = entity?.fields.find((f) => f.name === field);
  if (!entity || !fieldDef) {
    return NextResponse.json({ error: "Unknown field." }, { status: 400 });
  }
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "Select at least one record." }, { status: 400 });
  }

  let coerced: unknown = value;
  if (fieldDef.type === "boolean") coerced = value === true || value === "true";
  if (fieldDef.type === "number" || fieldDef.type === "currency") coerced = parseFloat(String(value)) || 0;

  // A bulk-set value into a refEntity-typed field (e.g. Customers' Accounts Receivable
  // Account) must belong to this same org — same reasoning as validateRefFields in crud.ts,
  // which this route bypasses since it builds its own UPDATE rather than going through
  // createRow/updateRow.
  if (fieldDef.type === "select" && fieldDef.refEntity && fieldDef.refEntity !== "organizations" && coerced) {
    const refEntity = getEntity(fieldDef.refEntity);
    if (refEntity && !(await idBelongsToOrg(refEntity.table, coerced, ctx.orgId))) {
      return NextResponse.json({ error: `Select a valid ${fieldDef.label}.` }, { status: 400 });
    }
  }

  const result = await pool.query(
    `UPDATE ${entity.table} SET ${field} = $1 WHERE organization_id = $2 AND id = ANY($3::uuid[])`,
    [coerced, ctx.orgId, ids]
  );

  return NextResponse.json({ updated: result.rowCount });
}
