import { NextRequest, NextResponse } from "next/server";
import { pool, queryOne } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { encryptSecret } from "@/lib/secrets-crypto";
import { invalidateOrgEmailConfig } from "@/lib/email";

interface OrgSmtpRow {
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_from: string | null;
  smtp_secure: boolean;
  smtp_password_encrypted: string | null;
}

// GET /api/settings/email-smtp — every non-secret field, plus password_set (never the
// decrypted password itself, or even the encrypted column) so the form can show "a password
// is already saved — leave blank to keep it" without ever exposing the value to the browser.
export async function GET() {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();

  const org = await queryOne<OrgSmtpRow>(
    `SELECT smtp_host, smtp_port, smtp_user, smtp_from, smtp_secure, smtp_password_encrypted
     FROM organizations WHERE id = $1`,
    [ctx.orgId]
  );
  return NextResponse.json({
    smtp_host: org?.smtp_host ?? "",
    smtp_port: org?.smtp_port ?? null,
    smtp_user: org?.smtp_user ?? "",
    smtp_from: org?.smtp_from ?? "",
    smtp_secure: Boolean(org?.smtp_secure),
    password_set: Boolean(org?.smtp_password_encrypted),
  });
}

function nullableStr(v: unknown) {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

// PATCH /api/settings/email-smtp — host/port/user are required; password is optional on an
// update (omit it to keep the currently-saved one — same "blank means unchanged" convention
// as any password-change form) but required the first time (password_set must already be
// true, or a password must be submitted). from/secure are always optional.
export async function PATCH(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Only owners and admins can update email settings." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  const host = nullableStr(body.smtp_host);
  if (!host) return NextResponse.json({ error: "SMTP Host is required." }, { status: 400 });

  const portRaw = Number(body.smtp_port);
  if (!Number.isInteger(portRaw) || portRaw < 1 || portRaw > 65535) {
    return NextResponse.json({ error: "SMTP Port must be a valid port number." }, { status: 400 });
  }

  const user = nullableStr(body.smtp_user);
  if (!user) return NextResponse.json({ error: "SMTP Username is required." }, { status: 400 });

  const from = nullableStr(body.smtp_from);
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
     SET smtp_host = $2, smtp_port = $3, smtp_user = $4, smtp_password_encrypted = $5, smtp_from = $6, smtp_secure = $7
     WHERE id = $1`,
    [ctx.orgId, host, portRaw, user, passwordEncrypted, from, secure]
  );
  invalidateOrgEmailConfig(ctx.orgId);

  return NextResponse.json({ ok: true });
}

// DELETE /api/settings/email-smtp — clears this org's own SMTP settings, so emails fall back
// to the app-wide SMTP_* env vars (if set) or start failing with EmailNotConfiguredError
// (if not) — the same "clear this page's own configuration" pattern the Opening Balances
// settings page's Delete already uses.
export async function DELETE() {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Only owners and admins can update email settings." }, { status: 403 });
  }

  await pool.query(
    `UPDATE organizations
     SET smtp_host = NULL, smtp_port = NULL, smtp_user = NULL, smtp_password_encrypted = NULL,
         smtp_from = NULL, smtp_secure = false
     WHERE id = $1`,
    [ctx.orgId]
  );
  invalidateOrgEmailConfig(ctx.orgId);

  return NextResponse.json({ ok: true });
}
