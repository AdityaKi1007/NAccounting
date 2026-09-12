/* eslint-disable */
exports.shorthands = undefined;

// Lets a Sales Order optionally be tagged with a Property Master Project and Unit, matching
// Invoices/Payments Received (see migration 1766000000000_invoices_receipts_project_unit.js)
// and Chart of Accounts (1764000000000_chart_of_accounts_project.js). Same pattern: nullable
// and `ON DELETE SET NULL`, not `CASCADE` — a sales order's history and totals don't depend
// on the tagged Project/Unit still existing, so deleting one just clears the tag rather than
// touching the sales order.
exports.up = (pgm) => {
  pgm.addColumns('sales_orders', {
    project_id: { type: 'uuid', references: 'projects', onDelete: 'set null' },
    unit_id: { type: 'uuid', references: 'inventory', onDelete: 'set null' },
  });
  pgm.createIndex('sales_orders', 'project_id');
  pgm.createIndex('sales_orders', 'unit_id');
};

exports.down = (pgm) => {
  pgm.dropColumns('sales_orders', ['project_id', 'unit_id']);
};
