import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { decryptSecret } from "@/lib/secrets-crypto";
import {
  sendTestEmail,
  smtpTransportConfig,
  sendgridTransportConfig,
  sesTransportConfig,
  type TransportConfig,
  type EmailProvider,
} from "@/lib/email";

// POST /api/settings/email/test — sends a one-off test email using whichever provider's
// fields are currently in the form (not necessarily saved yet), so a user can confirm their
// details actually work before committing to Save. Body: { provider, to, ...that provider's
// own fields }. A secret field left blank (the "leave blank to keep it" case) falls back to
// decrypting the already-saved value for that same provider, so testing after only changing,
// say, the From name doesn't require re-typing the API key / secret access key / password.
export async function POST(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Only owners and admins can test email settings." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const to = typeof body.to === "string" ? body.to.trim() : "";
  if (!to) return NextResponse.json({ error: "A recipient email is required to send a test." }, { status: 400 });

  const provider = body.provider as EmailProvider;
  let cfg: TransportConfig;

  if (provider === "smtp") {
    const host = typeof body.smtp_host === "string" ? body.smtp_host.trim() : "";
    const port = Number(body.smtp_port);
    const user = typeof body.smtp_user === "string" ? body.smtp_user.trim() : "";
    const from = typeof body.smtp_from === "string" && body.smtp_from.trim() ? body.smtp_from.trim() : null;
    const fromName = typeof body.smtp_from_name === "string" && body.smtp_from_name.trim() ? body.smtp_from_name.trim() : null;
    const secure = Boolean(body.smtp_secure);
    let password = typeof body.smtp_password === "string" ? body.smtp_password : "";

    if (!host || !Number.isInteger(port) || !user) {
      return NextResponse.json({ error: "Fill in Host, Port and Username before testing." }, { status: 400 });
    }
    if (!password) {
      const existing = await queryOne<{ smtp_password_encrypted: string | null }>(
        `SELECT smtp_password_encrypted FROM organizations WHERE id = $1`,
        [ctx.orgId]
      );
      if (!existing?.smtp_password_encrypted) {
        return NextResponse.json({ error: "Enter a password before testing." }, { status: 400 });
      }
      password = decryptSecret(existing.smtp_password_encrypted);
    }
    cfg = smtpTransportConfig({ host, port, user, password, from, fromName, secure });
  } else if (provider === "sendgrid") {
    const fromEmail = typeof body.sendgrid_from_email === "string" ? body.sendgrid_from_email.trim() : "";
    const fromName =
      typeof body.sendgrid_from_name === "string" && body.sendgrid_from_name.trim() ? body.sendgrid_from_name.trim() : null;
    let apiKey = typeof body.sendgrid_api_key === "string" ? body.sendgrid_api_key : "";

    if (!fromEmail) {
      return NextResponse.json({ error: "Fill in From email before testing." }, { status: 400 });
    }
    if (!apiKey) {
      const existing = await queryOne<{ sendgrid_api_key_encrypted: string | null }>(
        `SELECT sendgrid_api_key_encrypted FROM organizations WHERE id = $1`,
        [ctx.orgId]
      );
      if (!existing?.sendgrid_api_key_encrypted) {
        return NextResponse.json({ error: "Enter an API Key before testing." }, { status: 400 });
      }
      apiKey = decryptSecret(existing.sendgrid_api_key_encrypted);
    }
    cfg = sendgridTransportConfig({ apiKey, fromEmail, fromName });
  } else if (provider === "ses") {
    const accessKeyId = typeof body.ses_access_key_id === "string" ? body.ses_access_key_id.trim() : "";
    const region = typeof body.ses_region === "string" ? body.ses_region.trim() : "";
    const fromEmail = typeof body.ses_from_email === "string" ? body.ses_from_email.trim() : "";
    const fromName = typeof body.ses_from_name === "string" && body.ses_from_name.trim() ? body.ses_from_name.trim() : null;
    let secretAccessKey = typeof body.ses_secret_access_key === "string" ? body.ses_secret_access_key : "";

    if (!accessKeyId || !region || !fromEmail) {
      return NextResponse.json({ error: "Fill in Access Key ID, Region and From email before testing." }, { status: 400 });
    }
    if (!secretAccessKey) {
      const existing = await queryOne<{ ses_secret_access_key_encrypted: string | null }>(
        `SELECT ses_secret_access_key_encrypted FROM organizations WHERE id = $1`,
        [ctx.orgId]
      );
      if (!existing?.ses_secret_access_key_encrypted) {
        return NextResponse.json({ error: "Enter a Secret Access Key before testing." }, { status: 400 });
      }
      secretAccessKey = decryptSecret(existing.ses_secret_access_key_encrypted);
    }
    cfg = sesTransportConfig({ accessKeyId, secretAccessKey, region, fromEmail, fromName });
  } else {
    return NextResponse.json({ error: "provider must be one of: smtp, sendgrid, ses." }, { status: 400 });
  }

  try {
    await sendTestEmail(cfg, to);
  } catch (err) {
    console.error("Email test send failed", err);
    const message = err instanceof Error ? err.message : "Could not send a test email.";
    return NextResponse.json({ error: `Test email failed: ${message}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
