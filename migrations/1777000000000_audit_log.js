/* eslint-disable */
exports.shorthands = undefined;

// Org-wide change history — "who changed what, and when" — for the entities the account
// owner explicitly asked to have audited: Invoices, Receipts (Payments Received), Customers,
// Vendors, Credit Notes (Credit Memos), Purchase Orders, Bills, Payments Made, Bank Accounts,
// Projects and Units. One row per create/update/delete on one of those entities, written by
// src/lib/audit-log.ts's recordAuditLog() from every code path that can write one (generic
// CRUD, the document create/update engine, and each entity's own bespoke create/update
// function — see that file's own comment for the full list of call sites).
//
// entity_id + entity_label identify the specific record (e.g. an invoice's id and its
// INV-000123 number) — not part of the four requested columns on their own, but without them
// old_data/new_data have no record to anchor to, so they're included as the minimum needed to
// make the log usable. user_id is null for a change made through a third-party API key rather
// than a signed-in user — api_key_id identifies which key in that case. changed_fields is only
// populated for 'update' (the field names whose value differed between old_data and new_data,
// after JSON-normalizing both sides — see diffChangedFields in audit-log.ts); it's left NULL
// for 'create' and 'delete', where "everything" or "nothing" respectively would be a
// meaningless list to enumerate.
exports.up = (pgm) => {
  pgm.createTable('audit_log', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'cascade' },
    user_id: { type: 'uuid', references: 'users', onDelete: 'set null' },
    api_key_id: { type: 'uuid', references: 'api_keys', onDelete: 'set null' },
    action: { type: 'text', notNull: true }, // 'create' | 'update' | 'delete'
    module: { type: 'text', notNull: true }, // entity key, e.g. 'invoices', 'customers', 'bank-accounts'
    entity_id: { type: 'uuid' },
    entity_label: { type: 'text' }, // the record's own number/name at the time of the change, e.g. "INV-000123"
    old_data: { type: 'jsonb' },
    new_data: { type: 'jsonb' },
    changed_fields: { type: 'jsonb' }, // array of field names, 'update' only
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('audit_log', ['organization_id', 'created_at']);
  pgm.createIndex('audit_log', ['organization_id', 'module']);
  pgm.createIndex('audit_log', ['organization_id', 'entity_id']);
};

exports.down = (pgm) => {
  pgm.dropTable('audit_log');
};
