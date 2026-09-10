/* eslint-disable */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("payment_terms", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: { type: "uuid", notNull: true, references: "organizations", onDelete: "cascade" },
    name: { type: "text", notNull: true },
    is_default: { type: "boolean", notNull: true, default: false },
    is_active: { type: "boolean", notNull: true, default: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("payment_terms", "organization_id");

  pgm.sql(`
    INSERT INTO payment_terms (organization_id, name, is_default, is_active)
    SELECT o.id, t.name, t.is_default, true
    FROM organizations o
    CROSS JOIN (
      VALUES
        ('Due end of next month', false),
        ('Due end of the month', false),
        ('Due on Receipt', true),
        ('Net 15', false),
        ('Net 30', false),
        ('Net 45', false),
        ('Net 60', false)
    ) AS t(name, is_default)
  `);
};

exports.down = (pgm) => {
  pgm.dropTable("payment_terms", { ifExists: true, cascade: true });
};
