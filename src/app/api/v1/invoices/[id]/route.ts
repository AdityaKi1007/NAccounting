import { NextRequest, NextResponse } from "next/server";
import { getApiKeyContext, apiUnauthorized, checkApiRequestLimit } from "@/lib/api-context";
import { documentConfigs } from "@/lib/documents";
import { getDocument, updateDocument, type DocumentBody } from "@/lib/documents-api";
import { getDisabledFields, filterConfigurableFields } from "@/lib/api-field-config";

const cfg = documentConfigs.invoices;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiKeyContext(_req);
  if (!ctx) return apiUnauthorized();

  const doc = await getDocument(cfg, ctx.orgId, params.id);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data: doc });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiKeyContext(req);
  if (!ctx) return apiUnauthorized();
  const limitError = await checkApiRequestLimit(ctx.orgId);
  if (limitError) return limitError;

  const body: DocumentBody = await req.json().catch(() => ({ header: {}, lines: [] }));
  if (body.header) {
    const disabled = await getDisabledFields(ctx.orgId, "invoices", "update");
    body.header = filterConfigurableFields("invoices", "update", body.header, disabled);
  }
  const result = await updateDocument(cfg, ctx.orgId, params.id, body, { apiKeyId: ctx.apiKeyId });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  // Return the full updated document, same reasoning as the create endpoint above.
  const doc = await getDocument(cfg, ctx.orgId, result.id!);
  return NextResponse.json({ data: doc });
}
