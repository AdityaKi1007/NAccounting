import { NextRequest, NextResponse } from "next/server";
import { getApiKeyContext, apiUnauthorized } from "@/lib/api-context";
import { listCreditOrDebitNotes, createCreditOrDebitNote, getCreditOrDebitNote, NoteLineInput } from "@/lib/credit-debit-notes-api";
import { getDisabledFields, filterConfigurableFields } from "@/lib/api-field-config";

// Credit Memos (Credit Notes) — always created against one specific invoice; there's no
// standalone credit memo not tied to an invoice in this app (see credit-debit-notes-api.ts).
// Debit Notes are NOT exposed under /api/v1 — the user's request named only "credit memo",
// so debit notes were left out of this API surface as a deliberate scope decision (the
// internal app still has them at /debit-notes).
//
// Body:
//   {
//     invoice_id: "...",        // required — the invoice this credit memo is issued against
//     note_date?: "2026-09-10", // defaults to today
//     reference_number?: "...",
//     reason?: "...",
//     taxPercent?: 5,
//     lines: [ { item_id?: "...", description: "...", quantity: 1, rate: 100 }, ... ]
//   }
export async function GET(req: NextRequest) {
  const ctx = await getApiKeyContext(req);
  if (!ctx) return apiUnauthorized();

  const notes = await listCreditOrDebitNotes("credit", ctx.orgId);
  return NextResponse.json({ data: notes });
}

export async function POST(req: NextRequest) {
  const ctx = await getApiKeyContext(req);
  if (!ctx) return apiUnauthorized();

  const rawBody = await req.json().catch(() => ({}));
  const disabled = await getDisabledFields(ctx.orgId, "credit-notes", "create");
  const body = filterConfigurableFields("credit-notes", "create", rawBody, disabled);
  const invoiceId = typeof body.invoice_id === "string" ? body.invoice_id : "";
  if (!invoiceId) return NextResponse.json({ error: "invoice_id is required." }, { status: 400 });

  const lines: NoteLineInput[] = Array.isArray(body.lines) ? body.lines : [];
  const result = await createCreditOrDebitNote("credit", ctx.orgId, invoiceId, {
    note_date: body.note_date as string | undefined,
    reference_number: body.reference_number as string | undefined,
    reason: body.reason as string | undefined,
    taxPercent: body.taxPercent as number | undefined,
    lines,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  // Return the full created note (including organization_id, now selected here too — see
  // getCreditOrDebitNote), matching the shape every other create endpoint in this API returns.
  const note = await getCreditOrDebitNote("credit", ctx.orgId, result.id!);
  return NextResponse.json({ data: note }, { status: 201 });
}
