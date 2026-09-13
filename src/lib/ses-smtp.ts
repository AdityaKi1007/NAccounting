import { createHmac } from "crypto";

// Converts an AWS IAM secret access key into the password AWS SES's SMTP interface expects —
// AWS's own documented, deterministic derivation algorithm
// (https://docs.aws.amazon.com/ses/latest/dg/smtp-credentials.html), reproduced here so this
// app can send through SES using the exact same nodemailer SMTP transport already used for the
// plain SMTP and SendGrid providers (see src/lib/email.ts), instead of pulling in the AWS SDK
// for a single "sign this and send" call. The SMTP *username* SES expects is just the access
// key id, completely unchanged — only the password needs this conversion.
//
// No network call, no secret material leaves this process, and the result is fully
// deterministic given (secretAccessKey, region) — the same two inputs always produce the same
// SMTP password, so nothing needs to be cached or stored beyond the secret access key itself
// (which is already stored encrypted — see secrets-crypto.ts).

const SES_SMTP_PASSWORD_VERSION = 0x04;
const SES_SMTP_FIXED_DATE = "11111111";
const SES_SMTP_SERVICE = "ses";
const SES_SMTP_TERMINAL = "aws4_request";
const SES_SMTP_MESSAGE = "SendRawEmail";

function hmacSha256(key: Buffer, msg: string): Buffer {
  return createHmac("sha256", key).update(msg, "utf8").digest();
}

export function deriveSesSmtpPassword(secretAccessKey: string, region: string): string {
  let signature = hmacSha256(Buffer.from(`AWS4${secretAccessKey}`, "utf8"), SES_SMTP_FIXED_DATE);
  signature = hmacSha256(signature, region);
  signature = hmacSha256(signature, SES_SMTP_SERVICE);
  signature = hmacSha256(signature, SES_SMTP_TERMINAL);
  signature = hmacSha256(signature, SES_SMTP_MESSAGE);
  const signatureAndVersion = Buffer.concat([Buffer.from([SES_SMTP_PASSWORD_VERSION]), signature]);
  return signatureAndVersion.toString("base64");
}

/** SES's SMTP interface lives at a per-region hostname — there is no single global endpoint
 * the way smtp.sendgrid.net is for SendGrid. Port 587 (STARTTLS) is used everywhere, same as
 * this app's own SMTP provider's non-465 default. */
export function sesSmtpHost(region: string): string {
  return `email-smtp.${region}.amazonaws.com`;
}
