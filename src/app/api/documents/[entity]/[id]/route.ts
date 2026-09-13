import { NextRequest, NextResponse } from "next/server";
import { pool, queryOne } from "@/lib/db";
import { documentConfigs } from "@/lib/documents";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { moduleAccessErrorResponse } from "@/lib/module-access";
import { getDocument, updateDocument, type DocumentBody } from "@/lib/documents-api";
import { recordAuditLog, AUDITED_MODULES } from "@/lib/audit-log";

export async function GET(
  _req: NextRequest,
  { params }: { params: { entity: string; id: string } }
) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const cfg = documentConfigs[params.entity];
  if (!cfg) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const accessError = await moduleAccessErrorResponse(ctx, params.entity, "view");
  if (accessError) return accessError;

  const doc = await getDocument(cfg, ctx.orgId, params.id);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(doc);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { entity: string; id: string } }
) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const cfg = documentConfigs[params.entity];
  if (!cfg) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const accessError = await moduleAccessErrorResponse(ctx, params.entity, "write");
  if (accessError) return accessError;

  const body: DocumentBody = await req.json().catch(() => ({ header: {}, lines: [] }));
  const result = await updateDocument(cfg, ctx.orgId, params.id, body, { userId: ctx.userId });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ id: result.id });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { entity: string; id: string } }
) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const cfg = documentConfigs[params.entity];
  if (!cfg) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const accessError = await moduleAccessErrorResponse(ctx, params.entity, "write");
  if (accessError) return accessError;

  // documents-api.ts has no shared deleteDocument() to hook (this DELETE has always lived
  // directly in this route), so the audit read-before-delete happens right here instead —
  // only for the document entities actually in scope for auditing (invoices, bills,
  // purchase-orders; quotes/sales-orders are not).
  const auditOldRow = AUDITED_MODULES.includes(params.entity)
    ? await queryOne<Record<string, unknown>>(`SELECT * FROM ${cfg.headerTable} WHERE organization_id = $1 AND id = $2`, [
        ctx.orgId,
        params.id,
      ])
    : null;

  await pool.query(`DELETE FROM ${cfg.headerTable} WHERE organization_id = $1 AND id = $2`, [ctx.orgId, params.id]);

  if (auditOldRow) {
    await recordAuditLog({
      orgId: ctx.orgId,
      actor: { userId: ctx.userId },
      action: "delete",
      module: params.entity,
      entityId: params.id,
      entityLabel: String(auditOldRow[cfg.numberField] ?? ""),
      oldData: auditOldRow,
      newData: null,
    });
  }

  return NextResponse.json({ ok: true });
}
