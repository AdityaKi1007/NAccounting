import { NextRequest, NextResponse } from "next/server";
import { getEntity } from "@/lib/entities";
import { listRows, createRow, resolveOrgIdForWrite } from "@/lib/crud";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { pool } from "@/lib/db";
import {
  syncPaymentJournal,
  syncPaymentMadeJournal,
  syncExpenseJournal,
  syncVendorCreditJournal,
  syncOpeningBalanceJournal,
  recomputeBillBalance,
} from "@/lib/auto-journal";

export async function GET(_req: NextRequest, { params }: { params: { entity: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const entity = getEntity(params.entity);
  if (!entity) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await listRows(params.entity, ctx.orgId);
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest, { params }: { params: { entity: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const entity = getEntity(params.entity);
  if (!entity) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (entity.restrictedCrud) {
    return NextResponse.json(
      { error: `${entity.labelPlural} can't be created directly — create one from its invoice.` },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  for (const field of entity.fields) {
    if (field.required && (body[field.name] === undefined || body[field.name] === "")) {
      return NextResponse.json({ error: `${field.label} is required` }, { status: 400 });
    }
  }

  // For an entity with a real, editable organization_id field (currently only Projects — see
  // entities.ts), a submitted org id must be one of the caller's own memberships; a client
  // could otherwise create a record directly under an organization it has no membership in.
  const resolvedOrg = resolveOrgIdForWrite(entity, ctx.orgId, body, ctx.memberships);
  if (!resolvedOrg.valid) {
    return NextResponse.json({ error: "You're not a member of that organization." }, { status: 400 });
  }

  const row = await createRow(params.entity, resolvedOrg.orgId, body);

  // The dedicated /api/payments-received route (the Record Payment form) is the normal path
  // for creating a payment and already syncs its own journal — this only covers a payment
  // ever created through the generic entity CRUD instead (e.g. a bulk-update flow).
  if (params.entity === "payments-received" && row && typeof row === "object" && "id" in row) {
    const client = await pool.connect();
    try {
      await syncPaymentJournal(client, ctx.orgId, (row as { id: string }).id);
    } finally {
      client.release();
    }
  }

  // Payments Made, Expenses and Vendor Credits are plain generic-CRUD entities (no bespoke
  // create endpoint the way Payments Received has), so this is the only place their creation
  // can be hooked to keep the GL in sync — see auto-journal.ts's "Purchases side" section for
  // why these didn't post anything at all before.
  if (row && typeof row === "object" && "id" in row) {
    const rowId = (row as { id: string; bill_id?: string | null }).id;
    if (params.entity === "payments-made") {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await syncPaymentMadeJournal(client, ctx.orgId, rowId);
        const billId = (row as { bill_id?: string | null }).bill_id;
        if (billId) await recomputeBillBalance(client, ctx.orgId, billId);
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
        await syncExpenseJournal(client, ctx.orgId, rowId);
      } finally {
        client.release();
      }
    } else if (params.entity === "vendor-credits") {
      const client = await pool.connect();
      try {
        await syncVendorCreditJournal(client, ctx.orgId, rowId);
      } finally {
        client.release();
      }
    } else if (params.entity === "vendors") {
      // Vendors are also plain generic-CRUD (no bespoke create endpoint) — a newly created
      // vendor's opening_balance feeds the consolidated Opening Balances journal's Accounts
      // Payable line, so rebuild it here the same way customers' POST route does.
      const client = await pool.connect();
      try {
        await syncOpeningBalanceJournal(client, ctx.orgId);
      } finally {
        client.release();
      }
    }
  }

  return NextResponse.json({ row }, { status: 201 });
}
