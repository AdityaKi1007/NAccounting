/* eslint-disable */
exports.shorthands = undefined;

// A descriptive role catalog (name + description) for Settings > Users & Roles > Roles.
// Note: this is a catalog only — the app's actual access control still runs on the
// simple owner/admin/member enum on memberships, not on rows in this table.

exports.up = (pgm) => {
  pgm.createTable("roles", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: { type: "uuid", notNull: true, references: "organizations", onDelete: "cascade" },
    name: { type: "text", notNull: true },
    description: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("roles", "organization_id");

  pgm.sql(`
    INSERT INTO roles (organization_id, name, description)
    SELECT o.id, r.name, r.description
    FROM organizations o
    CROSS JOIN (
      VALUES
        ('Admin', 'Unrestricted access to all modules.'),
        ('Staff', 'Access to all modules except reports, settings and accounting.')
    ) AS r(name, description)
  `);
};

exports.down = (pgm) => {
  pgm.dropTable("roles", { ifExists: true, cascade: true });
};
