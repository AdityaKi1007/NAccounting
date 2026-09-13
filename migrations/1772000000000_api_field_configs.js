/* eslint-disable */
exports.shorthands = undefined;

// Backs the "Request Payload Builder" on Settings -> Integrations -> API Keys: lets an org
// add/remove which OPTIONAL fields their own /api/v1/* integration is allowed to send on
// create/update, for each of the six entities exposed there (invoices, sales-orders,
// receipts, customers, vendors, credit-notes). A field's full catalog (which fields exist per
// entity/operation, which are "core" and can never be turned off) lives in code
// (src/lib/api-field-config.ts), not in this table — this table only ever records the
// OPT-OUTS a specific organization has made.
//
// Deliberately an opt-out table (a row = "this org has turned this field off"), not a full
// on/off matrix: an org that has never touched this feature has zero rows here, which means
// "every optional field enabled" — i.e. today's actual behavior, so nothing regresses for any
// existing integration the moment this ships. This also matches this codebase's established
// preference for a real relational table over a jsonb blob (see role_permissions in
// 1768000000000_super_admin_access_control.js) — one row per disabled field, not one jsonb
// array column, so a single field can be toggled with a plain INSERT/DELETE rather than a
// read-modify-write of a blob.
//
// `entity`/`operation`/`field_name` are validated against the code-side catalog before a row
// is ever written (see saveDisabledFields in api-field-config.ts) — they're free text here
// only because the catalog itself lives in code and can grow without a migration.
exports.up = (pgm) => {
  pgm.createTable('api_field_configs', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'cascade' },
    entity: { type: 'text', notNull: true },
    operation: { type: 'text', notNull: true },
    field_name: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint(
    'api_field_configs',
    'api_field_configs_org_entity_op_field_unique',
    'UNIQUE(organization_id, entity, operation, field_name)'
  );
  pgm.createIndex('api_field_configs', ['organization_id', 'entity', 'operation']);
};

exports.down = (pgm) => {
  pgm.dropTable('api_field_configs');
};
