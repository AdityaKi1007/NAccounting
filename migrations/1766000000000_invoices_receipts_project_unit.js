/* eslint-disable */
exports.shorthands = undefined;

// Lets an Invoice and a Payment Received (Receipt) each optionally be tagged with a Property
// Master Project and Unit (see migration 1759300000000_property_master.js) — e.g. an invoice
// or a payment that's specifically for one real-estate unit within one project. Same pattern
// as Chart of Accounts' project_id (migration 1764000000000_chart_of_accounts_project.js):
// nullable and `ON DELETE SET NULL`, not `CASCADE` — an invoice's or receipt's GL history and
// usefulness don't depend on the tagged Project/Unit still existing, so deleting one just
// clears the tag rather than touching the invoice/receipt.
exports.up = (pgm) => {
  pgm.addColumns('invoices', {
    project_id: { type: 'uuid', references: 'projects', onDelete: 'set null' },
    unit_id: { type: 'uuid', references: 'inventory', onDelete: 'set null' },
  });
  pgm.createIndex('invoices', 'project_id');
  pgm.createIndex('invoices', 'unit_id');

  pgm.addColumns('payments_received', {
    project_id: { type: 'uuid', references: 'projects', onDelete: 'set null' },
    unit_id: { type: 'uuid', references: 'inventory', onDelete: 'set null' },
  });
  pgm.createIndex('payments_received', 'project_id');
  pgm.createIndex('payments_received', 'unit_id');
};

exports.down = (pgm) => {
  pgm.dropColumns('invoices', ['project_id', 'unit_id']);
  pgm.dropColumns('payments_received', ['project_id', 'unit_id']);
};
