/* eslint-disable */
exports.shorthands = undefined;

// Adds CRM CN No to Credit Notes — "add CRM CMNo field on credit notes table and this should
// also be added as input parameter in create and update API." Same free-text, nullable,
// non-unique convention as the five existing CRM reference-number fields (see
// migrations/1776000000000_crm_reference_numbers.js — CRM Inv No/Receipt No/Customer No/SO
// No/Vendor No): an external CRM system's own reference number for the record, just for
// matching records back up, no uniqueness or FK enforced.
//
// "create and update API" scope: credit_notes has no v1 update/PATCH endpoint at all — only
// create + void (see /api/v1/credit-notes/[id]/route.ts's own comment) — a pre-existing,
// deliberate scope decision unrelated to this feature, and the exact same constraint
// legal_entity_id hit on credit notes (migrations/1779000000000_legal_entity_on_documents.js).
// So crm_cn_no is necessarily create-only on the v1 API, same as every other credit-memo
// field including legal_entity_id.
//
// Debit Notes are left out entirely, same as legal_entity_id and the rest of the v1 API
// surface (debit notes were never exposed under /api/v1 — the user's request named only
// "credit notes").
exports.up = (pgm) => {
  pgm.addColumns('credit_notes', {
    crm_cn_no: { type: 'text' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('credit_notes', ['crm_cn_no']);
};
