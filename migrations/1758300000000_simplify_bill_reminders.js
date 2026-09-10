/* eslint-disable */
exports.shorthands = undefined;

// Zoho Books ships Bills with a single due-date reminder ("Default") plus the one
// expected-payment-date reminder, unlike Invoices which ship three due-date reminders.
// The original reminder_rules seed (1758100000000) gave every doc_type the same four
// rows; this trims Bills down to match the reference product.

exports.up = (pgm) => {
  pgm.sql(`
    DELETE FROM reminder_rules WHERE doc_type = 'bills' AND name IN ('Reminder - 2', 'Reminder - 3')
  `);
  pgm.sql(`
    UPDATE reminder_rules SET name = 'Default' WHERE doc_type = 'bills' AND name = 'Reminder - 1'
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    UPDATE reminder_rules SET name = 'Reminder - 1' WHERE doc_type = 'bills' AND name = 'Default'
  `);
  pgm.sql(`
    INSERT INTO reminder_rules (organization_id, doc_type, name, trigger_basis, offset_days, direction, is_active)
    SELECT o.id, 'bills', r.name, 'due_date', 0, 'after', false
    FROM organizations o
    CROSS JOIN (VALUES ('Reminder - 2'), ('Reminder - 3')) AS r(name)
    WHERE NOT EXISTS (
      SELECT 1 FROM reminder_rules rr WHERE rr.organization_id = o.id AND rr.doc_type = 'bills' AND rr.name = r.name
    )
  `);
};
