/* eslint-disable */
exports.shorthands = undefined;

// Organization Logo upload (Settings -> Company -> Profile). Stored the same way the S3
// attachments feature stores its files: the actual bytes live in the org's own configured S3
// bucket (or the app-wide AWS_*/S3_* env-var fallback — see src/lib/s3.ts), only the object
// key + content type are persisted here. Nullable, no default — most orgs start with no logo.
//
// Deliberately NOT reusing the generic `attachments` table (see src/lib/attachments.ts):
// that table models "N files attached to one entity row owned by this org" (entity_type +
// entity_id, with a per-entity cap and a shared per-org quota) — a logo is a single,
// org-owned singleton, not an attachment to some other record, so a plain pair of columns
// directly on `organizations` (matching how smtp_*/s3_* config already lives on this same
// row) is the better fit and avoids awkwardly overloading the attachments quota/cap logic
// for a one-per-org case.
exports.up = (pgm) => {
  pgm.addColumns('organizations', {
    logo_key: { type: 'text' },
    logo_content_type: { type: 'text' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('organizations', ['logo_key', 'logo_content_type']);
};
