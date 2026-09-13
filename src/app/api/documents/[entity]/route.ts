import { NextRequest, NextResponse } from "next/server";
import { documentConfigs } from "@/lib/documents";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { moduleAccessErrorResponse } from "@/lib/module-access";
import { createDocument, type DocumentBody } from "@/lib/documents-api";

export async function POST(req: NextRequest, { params }: { params: { entity: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const cfg = documentConfigs[params.entity];
  if (!cfg) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const accessError = await moduleAccessErrorResponse(ctx, params.entity, "write");
  if (accessError) return accessError;

  const body: DocumentBody = await req.json().catch(() => ({ header: {}, lines: [] }));
  const result = await createDocument(cfg, ctx.orgId, body, { userId: ctx.userId });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ id: result.id }, { status: 201 });
}
