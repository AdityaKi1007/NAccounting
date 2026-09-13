/* eslint-disable */
exports.shorthands = undefined;

// Lets each of these five entities carry an external CRM system's own reference number for
// that record, so an organization syncing to/from an outside CRM has somewhere to store the
// CRM-side id and match records back up — a plain free-text field, not a foreign key, and not
// unique-constrained (an org migrating historical data, or one whose CRM export has gaps/
// duplicates, shouldn't have inserts blocked over it). Same nullable-text shape and "no
// uniqueness" choice as the existing reference_number field on sales_orders/payments_received
// (see migrations/1757000000000_init.js) — this follows that same established convention
// rather than inventing a new one.
exports.up = (pgm) => {
  pgm.addColumns('invoices', {
    crm_inv_no: { type: 'text' },
  });
  pgm.addColumns('payments_received', {
    crm_receipt_no: { type: 'text' },
  });
  pgm.addColumns('customers', {
    crm_customer_no: { type: 'text' },
  });
  pgm.addColumns('sales_orders', {
    crm_so_no: { type: 'text' },
  });
  pgm.addColumns('vendors', {
    crm_vendor_no: { type: 'text' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('invoices', ['crm_inv_no']);
  pgm.dropColumns('payments_received', ['crm_receipt_no']);
  pgm.dropColumns('customers', ['crm_customer_no']);
  pgm.dropColumns('sales_orders', ['crm_so_no']);
  pgm.dropColumns('vendors', ['crm_vendor_no']);
};
