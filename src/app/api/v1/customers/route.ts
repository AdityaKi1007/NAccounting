import { NextRequest, NextResponse } from "next/server";
import { getApiKeyContext, apiUnauthorized } from "@/lib/api-context";
import { listRows, createRow } from "@/lib/crud";

// Body shape for POST/PATCH mirrors the "customers" entity fields in src/lib/entities.ts —
// display_name is the only required field, e.g.
//   { display_name: "Acme LLC", email: "ap@acme.com", currency: "AED", billing_address: "..." }
export async function GET(req: NextRequest) {
  const ctx = await getApiKeyContext(req);
  if (!ctx) return apiUnauthorized();

  const customers = await listRows("customers", ctx.orgId);
  return NextResponse.json({ data: customers });
}

export async function POST(req: NextRequest) {
  const ctx = await getApiKeyContext(req);
  if (!ctx) return apiUnauthorized();

  const body = await req.json().catch(() => ({}));
  if (!body.display_name || typeof body.display_name !== "string" || !body.display_name.trim()) {
    return NextResponse.json({ error: "display_name is required." }, { status: 400 });
  }

  const row = await createRow("customers", ctx.orgId, body);
  return NextResponse.json({ data: row }, { status: 201 });
}
