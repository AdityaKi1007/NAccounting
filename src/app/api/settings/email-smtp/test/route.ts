import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { decryptSecret } from "@/lib/secrets-crypto";
import { sendTestEmail, type SmtpConfig } from "@/lib/email";

// POST /api/settings/email-smtp/test — sends a one-off test email using the values currently
// in the form (not necessarily saved yet), so a user can confirm their SMTP details actually
// work before committing to Save. Body: { to, smtp_host, smtp_port, smtp_user, smtp_from,
// smtp_secure, smtp_password? }. If smtp_password is omitted (the "leave blank to keep it"
// case), the already-saved encrypted password is decrypted and used instead — so testing
// after only changing, say, the From address doesn't require re-typing the password.
export async function POST(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Only owners and admins can test email settings." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const to = typeof body.to === "string" ? body.to.trim() : "";
  if (!to) return NextResponse.json({ error: "A recipient email is required to send a test." }, { status: 400 });

  const host = typeof body.smtp_host === "string" ? body.smtp_host.trim() : "";
  const port = Number(body.smtp_port);
  const user = typeof body.smtp_user === "string" ? body.smtp_user.trim() : "";
  const from = typeof body.smtp_from === "string" && body.smtp_from.trim() ? body.smtp_from.trim() : null;
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

  const cfg: SmtpConfig = { host, port, user, password, from, secure };

  try {
    await sendTestEmail(cfg, to);
  } catch (err) {
    console.error("SMTP test send failed", err);
    const message = err instanceof Error ? err.message : "Could not send a test email.";
    return NextResponse.json({ error: `Test email failed: ${message}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
