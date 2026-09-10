/* eslint-disable */
exports.shorthands = undefined;

// Two additions for the Sales Order detail page (convert-to-invoice / convert-to-purchase-
// order actions — see src/app/api/sales-orders/[id]/convert-to-*/route.ts):
//
//   - purchase_orders / purchase_order_items: a minimal new document type (mirrors
//     sales_orders/quotes — vendor, line items, status), registered generically in
//     src/lib/documents.ts + src/lib/entities.ts. No dedicated rich form like Sales Orders
//     got — it uses the same generic DocumentForm every other "document" kind uses.
//   - sales_orders.converted_invoice_id / converted_purchase_order_id: sql back-references
//     recording what a sales order was converted into, so its detail page can show "View
//     Invoice" / "View Purchase Order" instead of allowing a duplicate conversion, and so the
//     list can eventually show an "Invoiced" indicator. Nullable, set null on delete of the
//     target document (converting doesn't get undone, but deleting the resulting invoice/PO
//     shouldn't leave a dangling reference on the sales order).
exports.up = (pgm) => {
  pgm.createTable('purchase_orders', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'cascade' },
    po_number: { type: 'text', notNull: true },
    vendor_id: { type: 'uuid', references: 'vendors', onDelete: 'set null' },
    order_date: { type: 'date', notNull: true, default: pgm.func('current_date') },
    expected_delivery_date: { type: 'date' },
    status: { type: 'text', notNull: true, default: 'draft' }, // draft|confirmed|closed|void
    reference_number: { type: 'text' },
    subtotal: { type: 'numeric', notNull: true, default: 0 },
    tax_total: { type: 'numeric', notNull: true, default: 0 },
    total: { type: 'numeric', notNull: true, default: 0 },
    notes: { type: 'text' },
    terms_conditions: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createTable('purchase_order_items', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    purchase_order_id: { type: 'uuid', notNull: true, references: 'purchase_orders', onDelete: 'cascade' },
    item_id: { type: 'uuid', references: 'items', onDelete: 'set null' },
    description: { type: 'text' },
    quantity: { type: 'numeric', notNull: true, default: 1 },
    rate: { type: 'numeric', notNull: true, default: 0 },
    discount_percent: { type: 'numeric', notNull: true, default: 0 },
    amount: { type: 'numeric', notNull: true, default: 0 },
  });
  pgm.createIndex('purchase_orders', 'organization_id');

  pgm.addColumns('sales_orders', {
    converted_invoice_id: { type: 'uuid', references: 'invoices', onDelete: 'set null' },
    converted_purchase_order_id: { type: 'uuid', references: 'purchase_orders', onDelete: 'set null' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('sales_orders', ['converted_invoice_id', 'converted_purchase_order_id']);
  pgm.dropTable('purchase_order_items', { ifExists: true, cascade: true });
  pgm.dropTable('purchase_orders', { ifExists: true, cascade: true });
};
