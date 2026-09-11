/* eslint-disable */
exports.shorthands = undefined;

// Send Email feature for Invoices, Sales Orders, Purchase Orders, and Payments Received (see
// src/lib/email.ts for the SMTP wrapper and src/app/api/emails/route.ts for the send/list
// endpoint). Every send is logged here — both so a document's own history is visible, and so
// the emails are listed "under the respective customer or vendor profile" as requested. That
// second requirement is why party_type/party_id are stored directly on each row rather than
// resolved by joining back through the document tables at read time: it keeps the profile-page
// query a single indexed lookup and survives the (unlikely but possible) case of a document
// being deleted after an email about it was already sent.
//
// entity_type/entity_id (which document this email was about) and party_type/party_id (which
// customer or vendor it's filed under) are deliberately NOT foreign keys, the same polymorphic
// pattern already used by attachments.entity_type/entity_id and journal_lines.contact_type/
// contact_id — entity_type points at one of four different tables depending on its value, and
// party_type at one of two. Ownership/whitelisting is enforced in application code (see
// src/lib/emails.ts's ENTITY_TABLES/PARTY_TABLES maps) on every write, not by the DB.
exports.up = (pgm) => {
  pgm.createTable("sent_emails", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: { type: "uuid", notNull: true, references: "organizations", onDelete: "cascade" },
    entity_type: { type: "text", notNull: true },
    entity_id: { type: "uuid", notNull: true },
    party_type: { type: "text", notNull: true },
    party_id: { type: "uuid", notNull: true },
    to_email: { type: "text", notNull: true },
    cc_email: { type: "text" },
    subject: { type: "text", notNull: true },
    body: { type: "text", notNull: true },
    attachment_file_name: { type: "text" },
    // 'sent' or 'failed' — a failed send is still logged (with error_message) so it's visible
    // on the document/profile rather than silently vanishing; see the route's try/catch.
    status: { type: "text", notNull: true, default: "sent" },
    error_message: { type: "text" },
    sent_by: { type: "uuid", references: "users", onDelete: "set null" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  // The document's own "emails sent about this record" lookup.
  pgm.createIndex("sent_emails", ["entity_type", "entity_id"]);
  // The customer/vendor profile's "emails sent to/about this party" lookup.
  pgm.createIndex("sent_emails", ["party_type", "party_id"]);
  pgm.createIndex("sent_emails", ["organization_id"]);
};

exports.down = (pgm) => {
  pgm.dropTable("sent_emails");
};
