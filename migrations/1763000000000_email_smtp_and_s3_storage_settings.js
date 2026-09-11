exports.up = (pgm) => {
  // Per-organization SMTP settings for the Send Email feature (src/lib/email.ts). These
  // become the org's own mail account, taking priority over the app-wide SMTP_* env vars
  // (which stay as a fallback — see email.ts's getOrgSmtpConfig/getTransporterForOrg).
  // smtp_password is never stored in plaintext — see src/lib/secrets-crypto.ts.
  pgm.addColumns("organizations", {
    smtp_host: { type: "text" },
    smtp_port: { type: "integer" },
    smtp_user: { type: "text" },
    smtp_password_encrypted: { type: "text" },
    smtp_from: { type: "text" },
    smtp_secure: { type: "boolean", notNull: true, default: false },
  });

  // Per-organization S3 settings for the attachments feature (src/lib/s3.ts). Same
  // fallback-to-env-vars relationship as SMTP above. s3_secret_access_key is never stored in
  // plaintext.
  pgm.addColumns("organizations", {
    s3_access_key_id: { type: "text" },
    s3_secret_access_key_encrypted: { type: "text" },
    s3_region: { type: "text" },
    s3_bucket_name: { type: "text" },
    s3_endpoint: { type: "text" },
    s3_force_path_style: { type: "boolean", notNull: true, default: false },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns("organizations", [
    "smtp_host",
    "smtp_port",
    "smtp_user",
    "smtp_password_encrypted",
    "smtp_from",
    "smtp_secure",
    "s3_access_key_id",
    "s3_secret_access_key_encrypted",
    "s3_region",
    "s3_bucket_name",
    "s3_endpoint",
    "s3_force_path_style",
  ]);
};
