import { NextRequest, NextResponse } from "next/server";
import { getApiKeyContext, apiUnauthorized } from "@/lib/api-context";
import { getCreditOrDebitNote } from "@/lib/credit-debit-notes-api";

// GET only — no PATCH/update here. There is no internal equivalent anywhere in the app for
// editing a credit memo after it's created (only create + void), and force-fitting an update
// endpoint would risk balance_due/GL correctness this app doesn't otherwise support for this
// document. To change a credit memo, void it (POST /api/v1/credit-notes/{id}/void) and create
// a new one. This is a deliberate scope decision, disclosed in the API reference doc.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiKeyContext(_req);
  if (!ctx) return apiUnauthorized();

  const note = await getCreditOrDebitNote("credit", ctx.orgId, params.id);
  if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data: note });
}
