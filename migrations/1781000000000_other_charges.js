/* eslint-disable */
exports.shorthands = undefined;

// New "Other Charges" object under Property Master: a cost-breakdown line item belonging to
// a Project (e.g. "Land payments — AED 12.5Mn — 8% of gross outflow"). Requested directly:
// 'create object named "Other Charges" with fields Category (picklist: ...), Calculation
// basis, AED (psqft), AED Mn, % of gross outflow. this should have project selectable and
// other charges list should appear as a list under project.'
//
// Plain lookup/master table (no line items, no GL postings) — driven entirely off
// src/lib/entities.ts's generic flat CRUD, same as Buildings/Units/Legal Entities.
//
// project_id uses ON DELETE CASCADE (not the `set null` used for e.g. legal_entity_id on
// projects/documents) because this is a true composition relationship, exactly like
// buildings.project_id and inventory.project_id in migrations/1759300000000_property_master.js:
// an Other Charges row is a cost line item *of* a specific project and doesn't make sense
// without it — deleting the Project should take its Other Charges rows with it, not leave them
// dangling or silently reassign them.
exports.up = (pgm) => {
  pgm.createTable("other_charges", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: { type: "uuid", notNull: true, references: "organizations", onDelete: "cascade" },
    project_id: { type: "uuid", notNull: true, references: "projects", onDelete: "cascade" },
    // Fixed picklist, enforced by the UI's <select> (same convention as customers.customer_type
    // and price_lists.percentage_type — a plain text column, no DB check constraint) rather
    // than a free-text category:
    // Land payments | Construction cost | DLD & registration | RERA refundable deposit |
    // Development overheads | Sales & marketing | Approval authorities & consultants
    category: { type: "text", notNull: true },
    calculation_basis: { type: "text" },
    aed_psqft: { type: "numeric" },
    aed_mn: { type: "numeric" },
    pct_gross_outflow: { type: "numeric" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("other_charges", "project_id");
  pgm.createIndex("other_charges", "organization_id");
};

exports.down = (pgm) => {
  pgm.dropTable("other_charges");
};
