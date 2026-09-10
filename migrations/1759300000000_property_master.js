/* eslint-disable */
exports.shorthands = undefined;

// New "Property Master" module: Projects -> Buildings -> Units (inventory), a real-estate
// master-data hierarchy separate from the accounting entities. Plain lookup/master tables
// (no line items, no GL postings) — driven entirely off src/lib/entities.ts's generic flat
// CRUD, same as Vendors/Bank Accounts/Chart of Accounts.
//
// Parent links use ON DELETE CASCADE (not the `set null` used for e.g. invoices.customer_id)
// because these are true composition relationships: a Building doesn't make sense without
// its Project, and a Unit doesn't make sense without its Building — deleting the parent
// should take its children with it, the same way invoice_items cascade with their invoice.
exports.up = (pgm) => {
  pgm.createTable('projects', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'cascade' },
    name: { type: 'text', notNull: true },
    code: { type: 'text' },
    rera_project_name: { type: 'text' },
    status: { type: 'text', notNull: true, default: 'offplan' }, // offplan | ready
    plot_area: { type: 'numeric', notNull: true, default: 0 },
    project_arabic_name: { type: 'text' },
    rera_number: { type: 'text' },
    estimated_completion_date: { type: 'date' },
    completion_date: { type: 'date' },
    description: { type: 'text' },
    project_address: { type: 'text' },
    country: { type: 'text' },
    city: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('buildings', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'cascade' },
    project_id: { type: 'uuid', notNull: true, references: 'projects', onDelete: 'cascade' },
    name: { type: 'text', notNull: true },
    code: { type: 'text' },
    actual_handover_date: { type: 'date' },
    estimated_handover_date: { type: 'date' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('buildings', 'project_id');

  // Table is named `inventory` (matches the field spec's object name); the app surfaces it
  // to users as "Units" (EntityDef.labelPlural) since that's the more natural everyday name
  // for an individual sellable unit.
  pgm.createTable('inventory', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'cascade' },
    building_id: { type: 'uuid', notNull: true, references: 'buildings', onDelete: 'cascade' },
    project_id: { type: 'uuid', notNull: true, references: 'projects', onDelete: 'cascade' },
    name: { type: 'text', notNull: true },
    code: { type: 'text' },
    floor: { type: 'text' }, // free text, not numeric — real buildings have "Ground", "Mezzanine", etc.
    area: { type: 'numeric', notNull: true, default: 0 },
    listed_price: { type: 'numeric', notNull: true, default: 0 },
    status: { type: 'text', notNull: true, default: 'available' }, // reserved | available | sold | cancelled
    unit_type: { type: 'text' }, // apartment | villa
    unit_sub_type: { type: 'text' }, // studio | 1br | 2br | 3br
    usage_type: { type: 'text' }, // residential | commercial | retail
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('inventory', 'building_id');
  pgm.createIndex('inventory', 'project_id');
};

exports.down = (pgm) => {
  pgm.dropTable('inventory');
  pgm.dropTable('buildings');
  pgm.dropTable('projects');
};
