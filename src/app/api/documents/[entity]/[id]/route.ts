import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { documentConfigs } from "@/lib/documents";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { getDocument, updateDocument, type DocumentBody } from "@/lib/documents-api";

export async function GET(
  _req: NextRequest,
  { params }: { params: { entity: string; id: string } }
) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const cfg = documentConfigs[params.entity];
  if (!cfg) return NextResponse.json({ error: "Not found" }, { status: 404 });

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

  const body: DocumentBody = await req.json().catch(() => ({ header: {}, lines: [] }));
  const result = await updateDocument(cfg, ctx.orgId, params.id, body);
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

  await pool.query(`DELETE FROM ${cfg.headerTable} WHERE organization_id = $1 AND id = $2`, [ctx.orgId, params.id]);
  return NextResponse.json({ ok: true });
}
