/* eslint-disable */
exports.shorthands = undefined;

// Adds an optional legal_entity_id reference to Invoices, Sales Orders, Receipts (Payments
// Received) and Credit Memos — requested directly: "add legal entity parameter in invoice,
// receipt, credit memo, sales order create API payloads." Scoped, per the user's own
// follow-up answers, to: API-only (no in-app UI exposure — see documents.ts/receipts-api.ts/
// credit-debit-notes-api.ts for the extraHeaderFields/bespoke-field wiring, none of which
// touches any form component), create AND update on invoices/sales-orders/receipts, and
// added to the Request Payload Builder catalog (api-field-config.ts) for all of them.
//
// Credit Memos are the one exception to "create and update": there is no v1 update/PATCH
// endpoint for credit notes at all (see /api/v1/credit-notes/[id]/route.ts's own comment —
// only create + void exist, a pre-existing, deliberate scope decision unrelated to this
// feature), so legal_entity_id on credit memos is necessarily create-only, same as every
// other credit-memo field. Debit Notes are left out entirely, same as the rest of the v1 API
// surface (debit notes were never exposed under /api/v1 — only "credit memo" was asked for).
//
// ON DELETE SET NULL throughout, same reasoning as projects.legal_entity_id
// (migrations/1778000000000_legal_entities.js): a lookup reference a document points AT, not
// a parent it's composed from.
exports.up = (pgm) => {
  pgm.addColumns('invoices', {
    legal_entity_id: { type: 'uuid', references: 'legal_entities', onDelete: 'set null' },
  });
  pgm.createIndex('invoices', 'legal_entity_id');

  pgm.addColumns('sales_orders', {
    legal_entity_id: { type: 'uuid', references: 'legal_entities', onDelete: 'set null' },
  });
  pgm.createIndex('sales_orders', 'legal_entity_id');

  pgm.addColumns('payments_received', {
    legal_entity_id: { type: 'uuid', references: 'legal_entities', onDelete: 'set null' },
  });
  pgm.createIndex('payments_received', 'legal_entity_id');

  pgm.addColumns('credit_notes', {
    legal_entity_id: { type: 'uuid', references: 'legal_entities', onDelete: 'set null' },
  });
  pgm.createIndex('credit_notes', 'legal_entity_id');
};

exports.down = (pgm) => {
  pgm.dropColumns('credit_notes', ['legal_entity_id']);
  pgm.dropColumns('payments_received', ['legal_entity_id']);
  pgm.dropColumns('sales_orders', ['legal_entity_id']);
  pgm.dropColumns('invoices', ['legal_entity_id']);
};
