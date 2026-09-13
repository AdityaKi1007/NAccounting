/* eslint-disable */
exports.shorthands = undefined;

// New "Legal Entities" master-data table under Property Master, driven entirely off
// src/lib/entities.ts's generic flat CRUD (same pattern as Buildings/Units — see
// migrations/1759300000000_property_master.js) — a plain lookup table, no line items, no GL
// postings. Requested directly: "create new object name Legal Entities with fields Entity
// Name, Entity Name Arabic, Email, Phone, Registration Num, Description, this should be
// selectable on projects."
//
// projects.legal_entity_id is a plain optional reference (ON DELETE SET NULL, not cascade —
// unlike Project -> Building -> Unit, a Legal Entity is a lookup a Project points AT, not a
// parent it's composed from, so deleting the Legal Entity shouldn't take the Project with it).
exports.up = (pgm) => {
  pgm.createTable('legal_entities', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'cascade' },
    entity_name: { type: 'text', notNull: true },
    entity_name_arabic: { type: 'text' },
    email: { type: 'text' },
    phone: { type: 'text' },
    registration_num: { type: 'text' },
    description: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('legal_entities', 'organization_id');

  pgm.addColumns('projects', {
    legal_entity_id: { type: 'uuid', references: 'legal_entities', onDelete: 'set null' },
  });
  pgm.createIndex('projects', 'legal_entity_id');
};

exports.down = (pgm) => {
  pgm.dropColumns('projects', ['legal_entity_id']);
  pgm.dropTable('legal_entities');
};
