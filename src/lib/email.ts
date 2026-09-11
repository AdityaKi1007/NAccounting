import nodemailer, { type Transporter } from "nodemailer";
import { queryOne } from "@/lib/db";
import { decryptSecret } from "@/lib/secrets-crypto";

// Thin wrapper around nodemailer's SMTP transport for the Send Email feature (see
// src/lib/emails.ts for the entity/party whitelists and src/app/api/emails/route.ts for the
// endpoint that uses this). SMTP was chosen (over e.g. AWS SES) specifically so this works
// with any mail provider the user already has — Gmail, Office 365, a business mail server —
// via plain host/port/user/password, no new AWS setup required.
//
// Two ways to configure it, checked in this order:
//  1. Per-organization settings entered on Settings -> Integrations -> Email (SMTP) — see
//     EmailSmtpSettingsForm.tsx and /api/settings/email-smtp — stored on the organizations
//     row, the password encrypted (see secrets-crypto.ts). This is the primary path for a
//     real multi-tenant deployment: each organization sends mail through its own account.
//  2. The app-wide SMTP_* env vars (see .env.example) — kept as a fallback so a
//     single-organization/self-hosted install can keep working via .env alone, exactly as
//     before this settings page existed.

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from?: string | null;
  secure?: boolean;
}

function buildTransporter(cfg: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    // 465 is always implicit TLS; every other port (587, 25, or a local test server) starts
    // in plaintext and upgrades via STARTTLS, which nodemailer negotiates automatically as
    // long as secure:false — the explicit `secure` flag only needs to be true as an override
    // for a provider on a nonstandard port that still wants implicit TLS.
    secure: Boolean(cfg.secure) || cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.password },
  });
}

interface OrgSmtpRow {
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_password_encrypted: string | null;
  smtp_from: string | null;
  smtp_secure: boolean;
}

async function getOrgSmtpConfig(orgId: string): Promise<SmtpConfig | null> {
  const row = await queryOne<OrgSmtpRow>(
    `SELECT smtp_host, smtp_port, smtp_user, smtp_password_encrypted, smtp_from, smtp_secure
     FROM organizations WHERE id = $1`,
    [orgId]
  );
  if (!row?.smtp_host || !row.smtp_port || !row.smtp_user || !row.smtp_password_encrypted) return null;
  return {
    host: row.smtp_host,
    port: row.smtp_port,
    user: row.smtp_user,
    password: decryptSecret(row.smtp_password_encrypted),
    from: row.smtp_from,
    secure: row.smtp_secure,
  };
}

function getEnvSmtpConfig(): SmtpConfig | null {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD) return null;
  return {
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    user: SMTP_USER,
    password: SMTP_PASSWORD,
    from: process.env.SMTP_FROM || SMTP_USER,
    secure: process.env.SMTP_SECURE === "true",
  };
}

// One cached {transporter, from} per organization. invalidateOrgEmailConfig() must be
// called any time an org's settings are saved/cleared, so the next send rebuilds from the
// new credentials instead of reusing a stale connection/from-address.
const transporterCache = new Map<string, { transporter: Transporter; from: string }>();

async function getTransporterForOrg(orgId: string): Promise<{ transporter: Transporter; from: string }> {
  const cached = transporterCache.get(orgId);
  if (cached) return cached;

  const cfg = (await getOrgSmtpConfig(orgId)) ?? getEnvSmtpConfig();
  if (!cfg) throw new EmailNotConfiguredError();
  const entry = { transporter: buildTransporter(cfg), from: cfg.from || cfg.user };
  transporterCache.set(orgId, entry);
  return entry;
}

/** Call after an org's SMTP settings are saved or cleared, so the next sendEmail() rebuilds
 * its transporter from the new credentials instead of an old cached one. */
export function invalidateOrgEmailConfig(orgId: string): void {
  transporterCache.delete(orgId);
}

/** Thrown (and caught by the API route) when neither this organization's own SMTP settings
 * nor the app-wide SMTP_* env vars are configured yet. Every other feature in the app keeps
 * working; only sending an email fails, with this message instead of a raw nodemailer/socket
 * error. */
export class EmailNotConfiguredError extends Error {
  constructor() {
    super(
      "Email sending isn't configured yet — add your SMTP server details under Settings -> " +
        "Integrations -> Email (SMTP) to enable it."
    );
    this.name = "EmailNotConfiguredError";
  }
}

export interface SendEmailInput {
  to: string;
  cc?: string | null;
  subject: string;
  text: string;
  attachment?: { filename: string; content: Buffer; contentType: string } | null;
}

export async function sendEmail(orgId: string, input: SendEmailInput): Promise<void> {
  const { transporter, from } = await getTransporterForOrg(orgId);
  await transporter.sendMail({
    from,
    to: input.to,
    cc: input.cc || undefined,
    subject: input.subject,
    text: input.text,
    attachments: input.attachment
      ? [{ filename: input.attachment.filename, content: input.attachment.content, contentType: input.attachment.contentType }]
      : undefined,
  });
}

/** Sends a one-off test message using the given (not-yet-necessarily-saved) SMTP settings —
 * backs the "Send Test Email" button on the settings page, so a user can confirm their
 * details work before saving them. Never touches the cached per-org transporter. */
export async function sendTestEmail(cfg: SmtpConfig, to: string): Promise<void> {
  const transporter = buildTransporter(cfg);
  await transporter.sendMail({
    from: cfg.from || cfg.user,
    to,
    subject: "NeoAccountingZ test email",
    text:
      "This is a test email from NeoAccountingZ, confirming your SMTP settings are working " +
      "correctly. If you received this, invoices, receipts and other emails sent from " +
      "NeoAccountingZ will use this same mail server.",
  });
}
