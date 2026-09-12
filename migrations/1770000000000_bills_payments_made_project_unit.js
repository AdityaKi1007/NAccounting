/* eslint-disable */
exports.shorthands = undefined;

// Lets a Bill and a Payment Made each optionally be tagged with a Property Master Project and
// Unit — the purchases-side mirror of migration 1766000000000_invoices_receipts_project_unit.js
// (Invoices/Payments Received) and 1769000000000_sales_orders_project_unit.js (Sales Orders).
// Same pattern: nullable and `ON DELETE SET NULL`, not `CASCADE` — a bill's or payment's GL
// history doesn't depend on the tagged Project/Unit still existing, so deleting one just clears
// the tag rather than touching the bill/payment.
exports.up = (pgm) => {
  pgm.addColumns('bills', {
    project_id: { type: 'uuid', references: 'projects', onDelete: 'set null' },
    unit_id: { type: 'uuid', references: 'inventory', onDelete: 'set null' },
  });
  pgm.createIndex('bills', 'project_id');
  pgm.createIndex('bills', 'unit_id');

  pgm.addColumns('payments_made', {
    project_id: { type: 'uuid', references: 'projects', onDelete: 'set null' },
    unit_id: { type: 'uuid', references: 'inventory', onDelete: 'set null' },
  });
  pgm.createIndex('payments_made', 'project_id');
  pgm.createIndex('payments_made', 'unit_id');
};

exports.down = (pgm) => {
  pgm.dropColumns('bills', ['project_id', 'unit_id']);
  pgm.dropColumns('payments_made', ['project_id', 'unit_id']);
};
