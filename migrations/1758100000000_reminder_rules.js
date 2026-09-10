/* eslint-disable */
exports.shorthands = undefined;

// Automated reminder schedules only. The two "Manual Reminders" shown on the Reminders
// page (send-from-the-record-page templates) aren't configurable rows — they're rendered
// as fixed descriptive text, same as the rest of this build's honest placeholders.

exports.up = (pgm) => {
  pgm.createTable("reminder_rules", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: { type: "uuid", notNull: true, references: "organizations", onDelete: "cascade" },
    doc_type: { type: "text", notNull: true }, // invoices | bills
    name: { type: "text", notNull: true },
    trigger_basis: { type: "text", notNull: true, default: "due_date" }, // due_date | expected_payment_date
    offset_days: { type: "integer", notNull: true, default: 0 },
    direction: { type: "text", notNull: true, default: "after" }, // before | after
    is_active: { type: "boolean", notNull: true, default: false },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("reminder_rules", "organization_id");

  pgm.sql(`
    INSERT INTO reminder_rules (organization_id, doc_type, name, trigger_basis, offset_days, direction, is_active)
    SELECT o.id, d.doc_type, r.name, r.trigger_basis, 0, 'after', false
    FROM organizations o
    CROSS JOIN (VALUES ('invoices'), ('bills')) AS d(doc_type)
    CROSS JOIN (
      VALUES
        ('Payment Expected', 'expected_payment_date'),
        ('Reminder - 1', 'due_date'),
        ('Reminder - 2', 'due_date'),
        ('Reminder - 3', 'due_date')
    ) AS r(name, trigger_basis)
  `);
};

exports.down = (pgm) => {
  pgm.dropTable("reminder_rules", { ifExists: true, cascade: true });
};
