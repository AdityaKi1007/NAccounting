import { NextRequest, NextResponse } from "next/server";
import { getEntity } from "@/lib/entities";
import { listRows, createRow, resolveOrgIdForWrite, validateRefFields } from "@/lib/crud";
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
  getOrCreateBankGLAccount,
} from "@/lib/auto-journal";
import { logException } from "@/lib/debug-logs";

export async function GET(_req: NextRequest, { params }: { params: { entity: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const entity = getEntity(params.entity);
  if (!entity) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const accessError = await moduleAccessErrorResponse(ctx, params.entity, "view");
  if (accessError) return accessError;

  // Top-level try/catch feeding the new Debug Logs feature (see src/lib/debug-logs.ts) —
  // a no-op unless this org has explicitly turned Debug Logs on, otherwise behaves exactly
  // as before: the same 500 Next.js would already produce for an uncaught exception here.
  try {
    const rows = await listRows(params.entity, ctx.orgId);
    return NextResponse.json({ rows });
  } catch (err) {
    await logException({ orgId: ctx.orgId, source: "server", error: err, context: { route: `/api/entities/${params.entity}`, method: "GET" } });
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
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
  // adminOnly entities (e.g. "roles") aren't nav modules, so moduleAccessErrorResponse below
  // doesn't gate them at all — this is a separate, explicit check for that smaller set.
  if (entity.adminOnly && ctx.role !== "owner" && ctx.role !== "admin" && !ctx.isSuperAdmin) {
    return NextResponse.json({ error: "Only owners and admins can manage this." }, { status: 403 });
  }
  const accessError = await moduleAccessErrorResponse(ctx, params.entity, "write");
  if (accessError) return accessError;

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

  // Every account_id/customer_id/vendor_id/project_id/... this entity's fields reference must
  // actually belong to that same organization — see validateRefFields' own comment in crud.ts
  // for why the row's own organization_id being correct isn't enough on its own.
  const refCheck = await validateRefFields(params.entity, resolvedOrg.orgId, body);
  if (!refCheck.valid) {
    return NextResponse.json({ error: refCheck.error }, { status: 400 });
  }

  // Top-level try/catch feeding Debug Logs — see the GET handler's own comment above.
  try {
    const row = await createRow(params.entity, resolvedOrg.orgId, body, { userId: ctx.userId });

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
          await logException({ orgId: ctx.orgId, source: "server", error: err, context: { route: "/api/entities/payments-made", method: "POST", step: "journal-sync" } });
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
      } else if (params.entity === "bank-accounts") {
        // Ensures every new bank/credit-card account has a real, linked Chart of Accounts entry
        // from the moment it's created — not just lazily the first time a payment posts against
        // it (see getOrCreateBankGLAccount's own comment for why this matters: the Banking list
        // page's "Amount in Books" column, and every Deposit To/Paid Through picker, both depend
        // on this link existing). A no-op if the create body already supplied gl_account_id
        // (the user explicitly linked an existing Chart of Accounts entry instead).
        const client = await pool.connect();
        try {
          await getOrCreateBankGLAccount(client, ctx.orgId, rowId);
        } finally {
          client.release();
        }
      }
    }

    return NextResponse.json({ row }, { status: 201 });
  } catch (err) {
    await logException({ orgId: ctx.orgId, source: "server", error: err, context: { route: `/api/entities/${params.entity}`, method: "POST" } });
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
