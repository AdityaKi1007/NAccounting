/* eslint-disable */
exports.shorthands = undefined;

// Sales Orders got a dedicated create/edit form (src/components/sales-orders/SalesOrderForm.tsx)
// matching Zoho's real Sales Order screen, which needs a few fields the generic "document"
// shape (customer/date/secondDate/status/notes) doesn't have. These are additive/nullable so
// they don't disturb the generic /api/documents/sales-orders or /api/v1/sales-orders routes —
// see the new `extraHeaderFields`/`hasLineDiscount` support added to DocumentConfig in
// src/lib/documents.ts + src/lib/documents-api.ts, which both routes already go through.
exports.up = (pgm) => {
  pgm.addColumns('sales_orders', {
    reference_number: { type: 'text' },
    payment_terms: { type: 'text' },
    delivery_method: { type: 'text' },
    salesperson: { type: 'text' },
    terms_conditions: { type: 'text' },
  });
  pgm.addColumns('sales_order_items', {
    discount_percent: { type: 'numeric', notNull: true, default: 0 },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('sales_order_items', ['discount_percent']);
  pgm.dropColumns('sales_orders', [
    'reference_number',
    'payment_terms',
    'delivery_method',
    'salesperson',
    'terms_conditions',
  ]);
};
