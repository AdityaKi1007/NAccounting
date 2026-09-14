import { NextRequest, NextResponse } from "next/server";
import { pool, queryOne } from "@/lib/db";

// Public endpoint — deliberately not behind requireActiveContext/getApiOrgContext, since the
// whole point of an incoming webhook is that an external system with no NeoAccounting
// session calls it directly. The token in the URL is what stands in for auth here.

interface WebhookRow {
  id: string;
  organization_id: string;
  is_active: boolean;
  default_account_id: string | null;
  default_paid_through_account_id: string | null;
}

async function logCall(webhookId: string, orgId: string, statusCode: number, error: string | null) {
  await pool.query(
    `INSERT INTO incoming_webhook_calls (webhook_id, organization_id, status_code, error) VALUES ($1, $2, $3, $4)`,
    [webhookId, orgId, statusCode, error]
  );
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const webhook = await queryOne<WebhookRow>(
    `SELECT id, organization_id, is_active, default_account_id, default_paid_through_account_id
     FROM incoming_webhooks WHERE token = $1`,
    [params.token]
  );
  if (!webhook) {
    return NextResponse.json({ error: "Unknown webhook." }, { status: 404 });
  }
  if (!webhook.is_active) {
    await logCall(webhook.id, webhook.organization_id, 403, "Webhook is turned off.");
    return NextResponse.json({ error: "This webhook is turned off." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    await logCall(webhook.id, webhook.organization_id, 400, "Invalid JSON body.");
    return NextResponse.json({ error: "Send a JSON body with at least an amount." }, { status: 400 });
  }

  const amount = Number((body as Record<string, unknown>).amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    await logCall(webhook.id, webhook.organization_id, 400, "amount is required and must be a positive number.");
    return NextResponse.json({ error: "amount is required and must be a positive number." }, { status: 400 });
  }

  const rawDate = (body as Record<string, unknown>).date;
  const expenseDate = typeof rawDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;
  const referenceNumber = typeof (body as Record<string, unknown>).reference_number === "string"
    ? ((body as Record<string, unknown>).reference_number as string)
    : null;
  const notes =
    typeof (body as Record<string, unknown>).notes === "string"
      ? ((body as Record<string, unknown>).notes as string)
      : typeof (body as Record<string, unknown>).description === "string"
        ? ((body as Record<string, unknown>).description as string)
        : null;

  try {
    const res = await pool.query(
      `INSERT INTO expenses (organization_id, expense_date, account_id, paid_through_account_id, amount, reference_number, notes)
       VALUES ($1, COALESCE($2, CURRENT_DATE), $3, $4, $5, $6, $7) RETURNING id`,
      [
        webhook.organization_id,
        expenseDate,
        webhook.default_account_id,
        webhook.default_paid_through_account_id,
        amount,
        referenceNumber,
        notes,
      ]
    );

    await pool.query(
      `UPDATE incoming_webhooks SET trigger_count = trigger_count + 1, last_triggered_at = now() WHERE id = $1`,
      [webhook.id]
    );
    await logCall(webhook.id, webhook.organization_id, 201, null);

    return NextResponse.json({ ok: true, expense_id: res.rows[0].id }, { status: 201 });
  } catch (err) {
    console.error(err);
    await logCall(webhook.id, webhook.organization_id, 500, "Could not create the expense.");
    return NextResponse.json({ error: "Could not create the expense." }, { status: 500 });
  }
}
