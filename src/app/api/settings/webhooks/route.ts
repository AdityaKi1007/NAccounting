import { NextRequest, NextResponse } from "next/server";
import { pool, query, queryOne } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { canManageOrgSettings } from "@/lib/module-access";
import { generateWebhookToken, INCOMING_WEBHOOK_DAILY_LIMIT } from "@/lib/webhooks";

export async function GET() {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();

  const webhooks = await query(
    `SELECT w.id, w.name, w.token, w.is_active, w.trigger_count, w.last_triggered_at, w.created_at,
            w.default_account_id, a.name AS default_account_name,
            w.default_paid_through_account_id, ba.account_name AS default_paid_through_name
     FROM incoming_webhooks w
     LEFT JOIN accounts a ON a.id = w.default_account_id
     LEFT JOIN bank_accounts ba ON ba.id = w.default_paid_through_account_id
     WHERE w.organization_id = $1
     ORDER BY w.created_at ASC`,
    [ctx.orgId]
  );

  const usage = await queryOne<{ count: string }>(
    `SELECT COUNT(*) AS count FROM incoming_webhook_calls
     WHERE organization_id = $1 AND called_at >= date_trunc('day', now())`,
    [ctx.orgId]
  );

  return NextResponse.json({
    webhooks,
    usage: { used: Number(usage?.count ?? 0), limit: INCOMING_WEBHOOK_DAILY_LIMIT },
  });
}

export async function POST(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (!canManageOrgSettings(ctx)) {
    return NextResponse.json({ error: "Only owners and admins can create webhooks." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Webhook name is required." }, { status: 400 });

  const accountId = typeof body.default_account_id === "string" && body.default_account_id ? body.default_account_id : null;
  if (!accountId) {
    return NextResponse.json({ error: "Choose the expense account new expenses should post to." }, { status: 400 });
  }
  const account = await queryOne(`SELECT id FROM accounts WHERE id = $1 AND organization_id = $2`, [accountId, ctx.orgId]);
  if (!account) return NextResponse.json({ error: "That account was not found." }, { status: 400 });

  const paidThroughId =
    typeof body.default_paid_through_account_id === "string" && body.default_paid_through_account_id
      ? body.default_paid_through_account_id
      : null;
  if (paidThroughId) {
    const bankAccount = await queryOne(`SELECT id FROM bank_accounts WHERE id = $1 AND organization_id = $2`, [
      paidThroughId,
      ctx.orgId,
    ]);
    if (!bankAccount) return NextResponse.json({ error: "That paid-through account was not found." }, { status: 400 });
  }

  // A random 32-char token collision is astronomically unlikely; a couple of retries on the
  // unique-constraint error is enough to make this robust rather than a hard crash.
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = generateWebhookToken();
    try {
      const res = await pool.query(
        `INSERT INTO incoming_webhooks (organization_id, name, token, default_account_id, default_paid_through_account_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [ctx.orgId, name, token, accountId, paidThroughId]
      );
      return NextResponse.json({ webhook: res.rows[0] }, { status: 201 });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505" && attempt < 2) continue;
      console.error(err);
      return NextResponse.json({ error: "Could not create the webhook." }, { status: 500 });
    }
  }
  return NextResponse.json({ error: "Could not create the webhook." }, { status: 500 });
}
