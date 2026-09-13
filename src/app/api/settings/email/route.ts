import { NextRequest, NextResponse } from "next/server";
import { pool, queryOne } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { encryptSecret } from "@/lib/secrets-crypto";
import { invalidateOrgEmailConfig, type EmailProvider } from "@/lib/email";

// Settings -> Integrations -> Email Settings. An organization can store connection details for
// all three providers (SMTP, SendGrid, AWS SES) at once — saving one never touches the other
// two's stored columns — but exactly one is ever "active" (organizations.email_provider),
// which is what actually sends invoices/receipts/etc. See src/lib/email.ts for how the active
// provider's settings turn into a real SMTP connection.

interface OrgEmailRow {
  email_provider: EmailProvider | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_from: string | null;
  smtp_from_name: string | null;
  smtp_secure: boolean;
  smtp_password_encrypted: string | null;
  sendgrid_from_name: string | null;
  sendgrid_from_email: string | null;
  sendgrid_api_key_encrypted: string | null;
  ses_access_key_id: string | null;
  ses_region: string | null;
  ses_from_name: string | null;
  ses_from_email: string | null;
  ses_secret_access_key_encrypted: string | null;
}

const ROW_COLUMNS = `email_provider, smtp_host, smtp_port, smtp_user, smtp_from, smtp_from_name, smtp_secure,
   smtp_password_encrypted, sendgrid_from_name, sendgrid_from_email, sendgrid_api_key_encrypted,
   ses_access_key_id, ses_region, ses_from_name, ses_from_email, ses_secret_access_key_encrypted`;

function shapeRow(org: OrgEmailRow | null) {
  return {
    active_provider: org?.email_provider ?? null,
    smtp: {
      host: org?.smtp_host ?? "",
      port: org?.smtp_port ?? null,
      user: org?.smtp_user ?? "",
      from: org?.smtp_from ?? "",
      from_name: org?.smtp_from_name ?? "",
      secure: Boolean(org?.smtp_secure),
      password_set: Boolean(org?.smtp_password_encrypted),
    },
    sendgrid: {
      from_name: org?.sendgrid_from_name ?? "",
      from_email: org?.sendgrid_from_email ?? "",
      api_key_set: Boolean(org?.sendgrid_api_key_encrypted),
    },
    ses: {
      access_key_id: org?.ses_access_key_id ?? "",
      region: org?.ses_region ?? "",
      from_name: org?.ses_from_name ?? "",
      from_email: org?.ses_from_email ?? "",
      secret_key_set: Boolean(org?.ses_secret_access_key_encrypted),
    },
  };
}

// GET — every non-secret field for all three providers at once (so switching the Provider
// dropdown client-side never needs another round trip), plus a `_set` flag per secret (API
// key / secret access key / SMTP password) instead of ever exposing the decrypted value, and
// which provider is currently active.
export async function GET() {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();

  const org = await queryOne<OrgEmailRow>(`SELECT ${ROW_COLUMNS} FROM organizations WHERE id = $1`, [ctx.orgId]);
  return NextResponse.json(shapeRow(org));
}

function nullableStr(v: unknown) {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

function isEmailProvider(v: unknown): v is EmailProvider {
  return v === "smtp" || v === "sendgrid" || v === "ses";
}

// PATCH — body is { provider: "smtp"|"sendgrid"|"ses", ...that provider's own fields }. Saves
// only that provider's columns (the other two providers' saved settings are left completely
// untouched) and makes it the active one. A secret field (smtp_password / sendgrid_api_key /
// ses_secret_access_key) can be omitted to keep whatever's already saved — same "blank means
// unchanged" convention as every other secret field in this app — but is required the first
// time a provider is configured.
export async function PATCH(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Only owners and admins can update email settings." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const provider = body.provider;
  if (!isEmailProvider(provider)) {
    return NextResponse.json({ error: "provider must be one of: smtp, sendgrid, ses." }, { status: 400 });
  }

  if (provider === "smtp") {
    const host = nullableStr(body.smtp_host);
    if (!host) return NextResponse.json({ error: "SMTP Host is required." }, { status: 400 });

    const portRaw = Number(body.smtp_port);
    if (!Number.isInteger(portRaw) || portRaw < 1 || portRaw > 65535) {
      return NextResponse.json({ error: "SMTP Port must be a valid port number." }, { status: 400 });
    }

    const user = nullableStr(body.smtp_user);
    if (!user) return NextResponse.json({ error: "SMTP Username is required." }, { status: 400 });

    const from = nullableStr(body.smtp_from);
    const fromName = nullableStr(body.smtp_from_name);
    const secure = Boolean(body.smtp_secure);
    const password = typeof body.smtp_password === "string" ? body.smtp_password : "";

    const existing = await queryOne<{ smtp_password_encrypted: string | null }>(
      `SELECT smtp_password_encrypted FROM organizations WHERE id = $1`,
      [ctx.orgId]
    );
    let passwordEncrypted = existing?.smtp_password_encrypted ?? null;
    if (password) {
      passwordEncrypted = encryptSecret(password);
    } else if (!passwordEncrypted) {
      return NextResponse.json({ error: "SMTP Password is required." }, { status: 400 });
    }

    await pool.query(
      `UPDATE organizations
       SET smtp_host = $2, smtp_port = $3, smtp_user = $4, smtp_password_encrypted = $5, smtp_from = $6,
           smtp_from_name = $7, smtp_secure = $8, email_provider = 'smtp'
       WHERE id = $1`,
      [ctx.orgId, host, portRaw, user, passwordEncrypted, from, fromName, secure]
    );
  } else if (provider === "sendgrid") {
    const fromEmail = nullableStr(body.sendgrid_from_email);
    if (!fromEmail) return NextResponse.json({ error: "From email is required." }, { status: 400 });

    const fromName = nullableStr(body.sendgrid_from_name);
    const apiKey = typeof body.sendgrid_api_key === "string" ? body.sendgrid_api_key : "";

    const existing = await queryOne<{ sendgrid_api_key_encrypted: string | null }>(
      `SELECT sendgrid_api_key_encrypted FROM organizations WHERE id = $1`,
      [ctx.orgId]
    );
    let apiKeyEncrypted = existing?.sendgrid_api_key_encrypted ?? null;
    if (apiKey) {
      apiKeyEncrypted = encryptSecret(apiKey);
    } else if (!apiKeyEncrypted) {
      return NextResponse.json({ error: "API Key is required." }, { status: 400 });
    }

    await pool.query(
      `UPDATE organizations
       SET sendgrid_api_key_encrypted = $2, sendgrid_from_name = $3, sendgrid_from_email = $4, email_provider = 'sendgrid'
       WHERE id = $1`,
      [ctx.orgId, apiKeyEncrypted, fromName, fromEmail]
    );
  } else {
    // ses
    const accessKeyId = nullableStr(body.ses_access_key_id);
    if (!accessKeyId) return NextResponse.json({ error: "Access Key ID is required." }, { status: 400 });

    const region = nullableStr(body.ses_region);
    if (!region) return NextResponse.json({ error: "Region is required." }, { status: 400 });

    const fromEmail = nullableStr(body.ses_from_email);
    if (!fromEmail) return NextResponse.json({ error: "From email is required." }, { status: 400 });

    const fromName = nullableStr(body.ses_from_name);
    const secretAccessKey = typeof body.ses_secret_access_key === "string" ? body.ses_secret_access_key : "";

    const existing = await queryOne<{ ses_secret_access_key_encrypted: string | null }>(
      `SELECT ses_secret_access_key_encrypted FROM organizations WHERE id = $1`,
      [ctx.orgId]
    );
    let secretEncrypted = existing?.ses_secret_access_key_encrypted ?? null;
    if (secretAccessKey) {
      secretEncrypted = encryptSecret(secretAccessKey);
    } else if (!secretEncrypted) {
      return NextResponse.json({ error: "Secret Access Key is required." }, { status: 400 });
    }

    await pool.query(
      `UPDATE organizations
       SET ses_access_key_id = $2, ses_secret_access_key_encrypted = $3, ses_region = $4,
           ses_from_name = $5, ses_from_email = $6, email_provider = 'ses'
       WHERE id = $1`,
      [ctx.orgId, accessKeyId, secretEncrypted, region, fromName, fromEmail]
    );
  }

  invalidateOrgEmailConfig(ctx.orgId);

  const org = await queryOne<OrgEmailRow>(`SELECT ${ROW_COLUMNS} FROM organizations WHERE id = $1`, [ctx.orgId]);
  return NextResponse.json(shapeRow(org));
}

// DELETE /api/settings/email?provider=smtp — clears just that one provider's own columns,
// leaving the other two providers' saved settings untouched. If the cleared provider was the
// active one, email_provider goes back to NULL (falling back to the app-wide SMTP_* env vars,
// if set, or EmailNotConfiguredError otherwise) — same "clear this page's own configuration"
// pattern the Opening Balances and File Storage settings pages already use.
export async function DELETE(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Only owners and admins can update email settings." }, { status: 403 });
  }

  const provider = new URL(req.url).searchParams.get("provider");
  if (!isEmailProvider(provider)) {
    return NextResponse.json({ error: "provider must be one of: smtp, sendgrid, ses." }, { status: 400 });
  }

  if (provider === "smtp") {
    await pool.query(
      `UPDATE organizations
       SET smtp_host = NULL, smtp_port = NULL, smtp_user = NULL, smtp_password_encrypted = NULL,
           smtp_from = NULL, smtp_from_name = NULL, smtp_secure = false,
           email_provider = CASE WHEN email_provider = 'smtp' THEN NULL ELSE email_provider END
       WHERE id = $1`,
      [ctx.orgId]
    );
  } else if (provider === "sendgrid") {
    await pool.query(
      `UPDATE organizations
       SET sendgrid_api_key_encrypted = NULL, sendgrid_from_name = NULL, sendgrid_from_email = NULL,
           email_provider = CASE WHEN email_provider = 'sendgrid' THEN NULL ELSE email_provider END
       WHERE id = $1`,
      [ctx.orgId]
    );
  } else {
    await pool.query(
      `UPDATE organizations
       SET ses_access_key_id = NULL, ses_secret_access_key_encrypted = NULL, ses_region = NULL,
           ses_from_name = NULL, ses_from_email = NULL,
           email_provider = CASE WHEN email_provider = 'ses' THEN NULL ELSE email_provider END
       WHERE id = $1`,
      [ctx.orgId]
    );
  }

  invalidateOrgEmailConfig(ctx.orgId);

  const org = await queryOne<OrgEmailRow>(`SELECT ${ROW_COLUMNS} FROM organizations WHERE id = $1`, [ctx.orgId]);
  return NextResponse.json(shapeRow(org));
}
