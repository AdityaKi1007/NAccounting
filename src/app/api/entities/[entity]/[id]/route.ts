import { NextRequest, NextResponse } from "next/server";
import { getEntity } from "@/lib/entities";
import { getRow, updateRow, deleteRow, resolveOrgIdForWrite } from "@/lib/crud";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { moduleAccessErrorResponse } from "@/lib/module-access";
import { pool } from "@/lib/db";
import {
  syncPaymentJournal,
  syncPaymentMadeJournal,
  syncExpenseJournal,
  syncVendorCreditJournal,
  syncOpeningBalanceJournal,
  recomputeBillBalance,
} from "@/lib/auto-journal";
import { reverseReceiptApplication } from "@/lib/receipts-api";
import { billsAllocatedByPayment } from "@/lib/payments-made-api";

export async function GET(
  _req: NextRequest,
  { params }: { params: { entity: string; id: string } }
) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const entity = getEntity(params.entity);
  if (!entity) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const accessError = await moduleAccessErrorResponse(ctx, params.entity, "view");
  if (accessError) return accessError;

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
  const accessError = await moduleAccessErrorResponse(ctx, params.entity, "write");
  if (accessError) return accessError;

  // Capture every bill this payment currently has an allocation against BEFORE the update —
  // the generic edit form (see entities.ts's payments-made fields) can change amount/status,
  // both of which recomputeBillBalance needs to re-derive correctly for each of them.
  const previousBillIds =
    params.entity === "payments-made" ? await billsAllocatedByPayment(ctx.orgId, params.id) : [];

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
      // The generic edit form doesn't touch bill_payment_allocations itself, but it can
      // change amount/status, which changes what each already-allocated bill's balance_due
      // should be — recompute every bill this payment is (still) allocated against.
      for (const billId of previousBillIds) await recomputeBillBalance(client, ctx.orgId, billId);
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
  } else if (params.entity === "vendors") {
    // opening_balance may have changed — rebuild the consolidated Opening Balances journal's
    // Accounts Payable line so the GL stays in sync with this vendor's saved value.
    const client = await pool.connect();
    try {
      await syncOpeningBalanceJournal(client, ctx.orgId);
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
  const accessError = await moduleAccessErrorResponse(ctx, params.entity, "write");
  if (accessError) return accessError;

  // A deleted Payment Made's own auto-journal is cleaned up for free by ON DELETE CASCADE
  // (see the manual_journals.payment_made_id FK), and so are its bill_payment_allocations
  // rows (they cascade with the payment) — but every bill it had been applied to needs its
  // balance_due/status recomputed now that this payment no longer exists, so the affected
  // bill ids have to be read out BEFORE the delete below (mirrors reverseReceiptApplication's
  // same "read allocations before they vanish" ordering on the receipts side).
  const billIds = params.entity === "payments-made" ? await billsAllocatedByPayment(ctx.orgId, params.id) : [];

  // Real bug found and fixed here (2026-09-10): payment_allocations cascade-deletes with the
  // payments_received row (see migrations/1758500000000_payment_allocations.js), but nothing
  // was ever restoring the balance_due/status of the invoice(s) that payment had been applied
  // to — deleting a receipt used to leave every invoice it touched permanently stuck at
  // whatever it last showed, Paid/Partially Paid included, even though the payment behind
  // that status no longer exists. reverseReceiptApplication has to run BEFORE the delete
  // below, in its own transaction, since the allocations it reads vanish the instant the
  // payment row does.
  if (params.entity === "payments-received") {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await reverseReceiptApplication(client, ctx.orgId, params.id);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(err);
    } finally {
      client.release();
    }
  }

  await deleteRow(params.entity, ctx.orgId, params.id);

  if (billIds.length > 0) {
    const client = await pool.connect();
    try {
      for (const id of billIds) await recomputeBillBalance(client, ctx.orgId, id);
    } finally {
      client.release();
    }
  }

  // Deleting a vendor removes its opening_balance from the AP total — rebuild the
  // consolidated Opening Balances journal so it doesn't keep counting the deleted row.
  if (params.entity === "vendors") {
    const client = await pool.connect();
    try {
      await syncOpeningBalanceJournal(client, ctx.orgId);
    } finally {
      client.release();
    }
  }

  return NextResponse.json({ ok: true });
}
