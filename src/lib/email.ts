import nodemailer, { type Transporter } from "nodemailer";
import { queryOne } from "@/lib/db";
import { decryptSecret } from "@/lib/secrets-crypto";
import { deriveSesSmtpPassword, sesSmtpHost } from "@/lib/ses-smtp";

// Sends every outbound email (invoices, receipts, etc. — see src/lib/emails.ts) through one of
// three providers an organization can connect on Settings -> Integrations -> Email Settings:
// SMTP (its own mail server), SendGrid, or AWS SES. Exactly one is "active"
// (organizations.email_provider) at a time — see EmailSettingsForm.tsx and
// /api/settings/email/route.ts for how an org switches between them without losing the other
// two providers' saved credentials.
//
// All three are sent through nodemailer's plain SMTP transport, never a provider-specific SDK:
// SendGrid and AWS SES each expose their own SMTP relay endpoint, so "authenticate and send"
// works identically for all three once the right host/port/user/password are worked out (see
// smtpTransportConfig/sendgridTransportConfig/sesTransportConfig below and, for SES's password,
// src/lib/ses-smtp.ts). This keeps the app's only mail dependency as nodemailer, matching the
// reasoning that originally chose SMTP over a dedicated AWS SES SDK.
//
// Two ways to configure it, checked in this order:
//  1. Per-organization settings entered on Settings -> Integrations -> Email Settings — stored
//     on the organizations row, every secret encrypted (see secrets-crypto.ts). This is the
//     primary path for a real multi-tenant deployment: each organization sends mail through
//     its own account.
//  2. The app-wide SMTP_* env vars (see .env.example) — kept as a fallback so a
//     single-organization/self-hosted install can keep working via .env alone, exactly as
//     before this settings page existed.

export type EmailProvider = "smtp" | "sendgrid" | "ses";

export const EMAIL_PROVIDERS: EmailProvider[] = ["smtp", "sendgrid", "ses"];

/** What every provider ultimately reduces to before handing off to nodemailer — see the three
 * *TransportConfig builders below. */
export interface TransportConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string | null;
  fromName?: string | null;
  secure?: boolean;
}

// Back-compat alias — every call site that pre-dates this multi-provider feature (the test
// route, the pre-existing SMTP settings form) referred to this shape as SmtpConfig.
export type SmtpConfig = TransportConfig;

export interface SmtpProviderInput {
  host: string;
  port: number;
  user: string;
  password: string;
  from?: string | null;
  fromName?: string | null;
  secure?: boolean;
}

export interface SendgridProviderInput {
  apiKey: string;
  fromEmail: string;
  fromName?: string | null;
}

export interface SesProviderInput {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  fromEmail: string;
  fromName?: string | null;
}

export function smtpTransportConfig(input: SmtpProviderInput): TransportConfig {
  return {
    host: input.host,
    port: input.port,
    user: input.user,
    password: input.password,
    from: input.from ?? null,
    fromName: input.fromName ?? null,
    secure: input.secure,
  };
}

// SendGrid's SMTP relay always uses the literal username "apikey" — the API key itself is the
// password. Port 587 with STARTTLS, same as this app's own SMTP default.
export function sendgridTransportConfig(input: SendgridProviderInput): TransportConfig {
  return {
    host: "smtp.sendgrid.net",
    port: 587,
    user: "apikey",
    password: input.apiKey,
    from: input.fromEmail,
    fromName: input.fromName ?? null,
    secure: false,
  };
}

export function sesTransportConfig(input: SesProviderInput): TransportConfig {
  return {
    host: sesSmtpHost(input.region),
    port: 587,
    user: input.accessKeyId,
    password: deriveSesSmtpPassword(input.secretAccessKey, input.region),
    from: input.fromEmail,
    fromName: input.fromName ?? null,
    secure: false,
  };
}

function buildTransporter(cfg: TransportConfig): Transporter {
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

/** Renders the RFC 5322 "From" header — `"Name" <address>` when a display name is set, the
 * bare address otherwise. Quotes are stripped from the name rather than escaped since a
 * literal `"` in a From name has no legitimate use here and stripping keeps this simple. */
function fromHeader(cfg: TransportConfig): string {
  const address = cfg.from || cfg.user;
  const name = cfg.fromName?.trim().replace(/"/g, "");
  return name ? `"${name}" <${address}>` : address;
}

interface OrgEmailRow {
  email_provider: EmailProvider | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_password_encrypted: string | null;
  smtp_from: string | null;
  smtp_from_name: string | null;
  smtp_secure: boolean;
  sendgrid_api_key_encrypted: string | null;
  sendgrid_from_name: string | null;
  sendgrid_from_email: string | null;
  ses_access_key_id: string | null;
  ses_secret_access_key_encrypted: string | null;
  ses_region: string | null;
  ses_from_name: string | null;
  ses_from_email: string | null;
}

const ORG_EMAIL_COLUMNS = `email_provider, smtp_host, smtp_port, smtp_user, smtp_password_encrypted, smtp_from,
   smtp_from_name, smtp_secure, sendgrid_api_key_encrypted, sendgrid_from_name, sendgrid_from_email,
   ses_access_key_id, ses_secret_access_key_encrypted, ses_region, ses_from_name, ses_from_email`;

/** Builds the TransportConfig for whichever provider is currently active on this org
 * (organizations.email_provider), or null if that provider's required fields aren't actually
 * filled in yet (defensive — the settings routes shouldn't let this happen, but a provider
 * switched active with incomplete data must fail closed, not silently send from garbage
 * config). Exported so the settings page's GET route can reuse the same row without a second
 * query. */
export async function getOrgEmailConfig(orgId: string): Promise<TransportConfig | null> {
  const row = await queryOne<OrgEmailRow>(`SELECT ${ORG_EMAIL_COLUMNS} FROM organizations WHERE id = $1`, [orgId]);
  if (!row?.email_provider) return null;

  if (row.email_provider === "smtp") {
    if (!row.smtp_host || !row.smtp_port || !row.smtp_user || !row.smtp_password_encrypted) return null;
    return smtpTransportConfig({
      host: row.smtp_host,
      port: row.smtp_port,
      user: row.smtp_user,
      password: decryptSecret(row.smtp_password_encrypted),
      from: row.smtp_from,
      fromName: row.smtp_from_name,
      secure: row.smtp_secure,
    });
  }

  if (row.email_provider === "sendgrid") {
    if (!row.sendgrid_api_key_encrypted || !row.sendgrid_from_email) return null;
    return sendgridTransportConfig({
      apiKey: decryptSecret(row.sendgrid_api_key_encrypted),
      fromEmail: row.sendgrid_from_email,
      fromName: row.sendgrid_from_name,
    });
  }

  // row.email_provider === "ses"
  if (!row.ses_access_key_id || !row.ses_secret_access_key_encrypted || !row.ses_region || !row.ses_from_email) return null;
  return sesTransportConfig({
    accessKeyId: row.ses_access_key_id,
    secretAccessKey: decryptSecret(row.ses_secret_access_key_encrypted),
    region: row.ses_region,
    fromEmail: row.ses_from_email,
    fromName: row.ses_from_name,
  });
}

function getEnvSmtpConfig(): TransportConfig | null {
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
// called any time an org's settings are saved/cleared/switched, so the next send rebuilds
// from the new credentials instead of reusing a stale connection/from-address.
const transporterCache = new Map<string, { transporter: Transporter; from: string }>();

async function getTransporterForOrg(orgId: string): Promise<{ transporter: Transporter; from: string }> {
  const cached = transporterCache.get(orgId);
  if (cached) return cached;

  const cfg = (await getOrgEmailConfig(orgId)) ?? getEnvSmtpConfig();
  if (!cfg) throw new EmailNotConfiguredError();
  const entry = { transporter: buildTransporter(cfg), from: fromHeader(cfg) };
  transporterCache.set(orgId, entry);
  return entry;
}

/** Call after an org's email settings are saved, cleared, or switched to a different active
 * provider, so the next sendEmail() rebuilds its transporter from the new credentials instead
 * of an old cached one. */
export function invalidateOrgEmailConfig(orgId: string): void {
  transporterCache.delete(orgId);
}

/** Thrown (and caught by the API route) when neither this organization's own email settings
 * nor the app-wide SMTP_* env vars are configured yet. Every other feature in the app keeps
 * working; only sending an email fails, with this message instead of a raw nodemailer/socket
 * error. */
export class EmailNotConfiguredError extends Error {
  constructor() {
    super(
      "Email sending isn't configured yet — connect SMTP, SendGrid, or AWS SES under Settings -> " +
        "Integrations -> Email Settings to enable it."
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

/** Sends a one-off test message using the given (not-yet-necessarily-saved) provider config —
 * backs the "Send Test Email" button on the settings page, so a user can confirm their details
 * work before saving them. Never touches the cached per-org transporter. */
export async function sendTestEmail(cfg: TransportConfig, to: string): Promise<void> {
  const transporter = buildTransporter(cfg);
  await transporter.sendMail({
    from: fromHeader(cfg),
    to,
    subject: "NeoAccountingZ test email",
    text:
      "This is a test email from NeoAccountingZ, confirming your email settings are working " +
      "correctly. If you received this, invoices, receipts and other emails sent from " +
      "NeoAccountingZ will use this same provider.",
  });
}
