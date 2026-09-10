import { NextRequest, NextResponse } from "next/server";
import { getEntity } from "@/lib/entities";
import { getRow, updateRow, deleteRow, resolveOrgIdForWrite } from "@/lib/crud";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { pool } from "@/lib/db";
import {
  syncPaymentJournal,
  syncPaymentMadeJournal,
  syncExpenseJournal,
  syncVendorCreditJournal,
  recomputeBillBalance,
} from "@/lib/auto-journal";

export async function GET(
  _req: NextRequest,
  { params }: { params: { entity: string; id: string } }
) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const entity = getEntity(params.entity);
  if (!entity) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const row = await getRow(params.entity, ctx.orgId, params.id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ row });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { entity: string; id: string } }
) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const entity = getEntity(params.entity);
  if (!entity) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (entity.restrictedCrud) {
    return NextResponse.json({ error: `${entity.labelPlural} can't be edited directly.` }, { status: 400 });
  }

  // Capture the bill this payment applied to BEFORE the update, in case the edit is what
  // changes (or clears) bill_id — both the old and new bill need their balance recomputed.
  const previousBillId =
    params.entity === "payments-made"
      ? ((await getRow(params.entity, ctx.orgId, params.id)) as { bill_id?: string | null } | null)?.bill_id ?? null
      : null;

  const body = await req.json().catch(() => ({}));

  // Same membership check as the POST route above (see resolveOrgIdForWrite in crud.ts) — a
  // submitted organization_id (Projects' reassignment dropdown) must be one of the caller's
  // real memberships. updateRow itself keeps looking the row up by ctx.orgId (the org the
  // row currently lives in) regardless; it's the SET clause built from body that actually
  // carries the new organization_id through, so no other change to updateRow is needed.
  const resolvedOrg = resolveOrgIdForWrite(entity, ctx.orgId, body, ctx.memberships);
  if (!resolvedOrg.valid) {
    return NextResponse.json({ error: "You're not a member of that organization." }, { status: 400 });
  }

  const row = await updateRow(params.entity, ctx.orgId, params.id, body);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Covers editing an existing payment through the generic edit form (status, amount, bank
  // charges, deposit account are all editable there — see payments-received in entities.ts),
  // which doesn't touch invoice allocations but should still keep the payment's own journal
  // in sync with whatever it now says.
  if (params.entity === "payments-received") {
    const client = await pool.connect();
    try {
      await syncPaymentJournal(client, ctx.orgId, params.id);
    } finally {
      client.release();
    }
  }

  // Same "only entry point" reasoning as the POST route above — see auto-journal.ts's
  // "Purchases side" section.
  if (params.entity === "payments-made") {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await syncPaymentMadeJournal(client, ctx.orgId, params.id);
      const newBillId = (row as { bill_id?: string | null }).bill_id ?? null;
      if (newBillId) await recomputeBillBalance(client, ctx.orgId, newBillId);
      if (previousBillId && previousBillId !== newBillId) {
        await recomputeBillBalance(client, ctx.orgId, previousBillId);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(err);
    } finally {
      client.release();
    }
  } else if (params.entity === "expenses") {
    const client = await pool.connect();
    try {
      await syncExpenseJournal(client, ctx.orgId, params.id);
    } finally {
      client.release();
    }
  } else if (params.entity === "vendor-credits") {
    const client = await pool.connect();
    try {
      await syncVendorCreditJournal(client, ctx.orgId, params.id);
    } finally {
      client.release();
    }
  }

  return NextResponse.json({ row });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { entity: string; id: string } }
) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const entity = getEntity(params.entity);
  if (!entity) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (entity.restrictedCrud) {
    return NextResponse.json(
      { error: `${entity.labelPlural} can't be deleted — void it instead.` },
      { status: 400 }
    );
  }

  // A deleted Payment Made's own auto-journal is cleaned up for free by ON DELETE CASCADE
  // (see the manual_journals.payment_made_id FK) — but the bill it was applied to needs its
  // balance_due/status recomputed now that this payment no longer exists.
  const billId =
    params.entity === "payments-made"
      ? ((await getRow(params.entity, ctx.orgId, params.id)) as { bill_id?: string | null } | null)?.bill_id ?? null
      : null;

  await deleteRow(params.entity, ctx.orgId, params.id);

  if (billId) {
    const client = await pool.connect();
    try {
      await recomputeBillBalance(client, ctx.orgId, billId);
    } finally {
      client.release();
    }
  }

  return NextResponse.json({ ok: true });
}
