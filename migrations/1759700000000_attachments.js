/* eslint-disable */
exports.shorthands = undefined;

// File uploads for Sales Orders, Purchase Orders, Payments Received, Customers, and Vendors.
// Files themselves live in S3 (see src/lib/s3.ts) under org-scoped keys
// ("orgs/{organizationId}/{entityType}/{entityId}/...") — this table is only the metadata
// pointer + the record that lets us enforce a per-organization storage quota (see
// src/lib/attachments.ts's ATTACHMENT_QUOTA_BYTES) by summing size_bytes per org, without a
// separate running-counter column that could drift from what's actually in S3.
//
// entity_type is one of the ATTACHMENT_ENTITY_TYPES keys in src/lib/attachments.ts (the same
// url-slug/entities.ts-registry keys used everywhere else in this app, e.g. "sales-orders",
// not the underscored table name) — deliberately NOT a foreign key, since it points at one
// of five different tables depending on its value; entity_id is likewise a plain uuid rather
// than an FK for the same reason. Ownership (does entity_id actually belong to this org, in
// the table entity_type implies) is checked in application code on every write/read, the
// same way journal_lines.contact_id/contact_type already do for a polymorphic reference.
exports.up = (pgm) => {
  pgm.createTable("attachments", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: { type: "uuid", notNull: true, references: "organizations", onDelete: "cascade" },
    entity_type: { type: "text", notNull: true },
    entity_id: { type: "uuid", notNull: true },
    file_name: { type: "text", notNull: true },
    file_key: { type: "text", notNull: true },
    content_type: { type: "text", notNull: true },
    size_bytes: { type: "bigint", notNull: true },
    created_by: { type: "uuid", references: "users", onDelete: "set null" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  // The lookup every list/detail view does: "attachments for this one record".
  pgm.createIndex("attachments", ["entity_type", "entity_id"]);
  // The lookup the quota check does: "how many bytes has this org used so far".
  pgm.createIndex("attachments", ["organization_id"]);
};

exports.down = (pgm) => {
  pgm.dropTable("attachments");
};
