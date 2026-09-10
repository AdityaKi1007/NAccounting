import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getEntity } from "@/lib/entities";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";

const ALLOWED_ENTITIES = ["items", "customers", "vendors"];

export async function POST(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();

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

  const result = await pool.query(
    `UPDATE ${entity.table} SET ${field} = $1 WHERE organization_id = $2 AND id = ANY($3::uuid[])`,
    [coerced, ctx.orgId, ids]
  );

  return NextResponse.json({ updated: result.rowCount });
}
