/* eslint-disable */
exports.shorthands = undefined;

// Expands the Settings -> Integrations -> "Email (SMTP)" page into "Email Settings": an org can
// now store connection details for SMTP, SendGrid, AND AWS SES at once, and pick exactly one
// of them ("organizations.email_provider") as the one actually used to send mail — switching
// providers never requires re-entering the other providers' saved credentials. Requested
// directly: "under integrations enable Email Settings and show there SMTP, SendGrid and AWS
// SES... give option to keep one of these active at a time."
//
// SendGrid and AWS SES are both sent through via their own SMTP relay endpoints (see
// src/lib/email.ts and src/lib/ses-smtp.ts) rather than a REST SDK for either — this keeps the
// app's only mail dependency as the nodemailer SMTP transport already used for the pre-existing
// SMTP provider (see that file's own comment for why SMTP was originally chosen over a
// SES-SDK approach), instead of adding two more npm packages for what's structurally the same
// "connect to a mail server and authenticate" operation three times over.
exports.up = (pgm) => {
  pgm.addColumns("organizations", {
    // Which provider's settings below are actually used to send mail right now. NULL means
    // "not configured yet" (falls back to the app-wide SMTP_* env vars, same as before this
    // feature existed). Never any value other than these three or NULL — enforced below.
    email_provider: { type: "text" },

    // SMTP: smtp_host/smtp_port/smtp_user/smtp_password_encrypted/smtp_from/smtp_secure
    // already existed (migrations/1774... well before this file — see the pre-existing
    // Email (SMTP) settings page). smtp_from_name is the only new SMTP column, added so SMTP
    // has the same "From name" + "From email" shape as SendGrid/SES below instead of a single
    // combined "From Address" field.
    smtp_from_name: { type: "text" },

    // SendGrid — sent via SendGrid's SMTP relay (smtp.sendgrid.net), where the SMTP username
    // is always the literal string "apikey" and the SMTP password is the API key itself, so
    // only the key + a from address/name need to be stored (see src/lib/email.ts).
    sendgrid_api_key_encrypted: { type: "text" },
    sendgrid_from_name: { type: "text" },
    sendgrid_from_email: { type: "text" },

    // AWS SES — sent via SES's own SMTP interface (email-smtp.<region>.amazonaws.com). The
    // SMTP username is the IAM access key id unchanged; the SMTP password has to be derived
    // from the secret access key using AWS's documented, deterministic algorithm (see
    // src/lib/ses-smtp.ts) rather than used as-is, which is why the region is required even
    // though nothing here looks like it should need it.
    ses_access_key_id: { type: "text" },
    ses_secret_access_key_encrypted: { type: "text" },
    ses_region: { type: "text" },
    ses_from_name: { type: "text" },
    ses_from_email: { type: "text" },
  });

  pgm.addConstraint("organizations", "organizations_email_provider_check", {
    check: "email_provider IS NULL OR email_provider IN ('smtp', 'sendgrid', 'ses')",
  });

  // Backfill: any organization that already had SMTP configured through the pre-existing
  // single-provider settings page becomes active on 'smtp' automatically, so its mail sending
  // doesn't silently stop the moment this migration runs.
  pgm.sql(`UPDATE organizations SET email_provider = 'smtp' WHERE smtp_host IS NOT NULL AND email_provider IS NULL`);
};

exports.down = (pgm) => {
  pgm.dropConstraint("organizations", "organizations_email_provider_check");
  pgm.dropColumns("organizations", [
    "email_provider",
    "smtp_from_name",
    "sendgrid_api_key_encrypted",
    "sendgrid_from_name",
    "sendgrid_from_email",
    "ses_access_key_id",
    "ses_secret_access_key_encrypted",
    "ses_region",
    "ses_from_name",
    "ses_from_email",
  ]);
};
