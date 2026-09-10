/* eslint-disable */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("number_series", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: { type: "uuid", notNull: true, references: "organizations", onDelete: "cascade" },
    entity_key: { type: "text", notNull: true }, // e.g. "invoices"
    mode: { type: "text", notNull: true, default: "auto" }, // auto | manual
    prefix: { type: "text", notNull: true, default: "" },
    next_number: { type: "integer", notNull: true, default: 1 },
    padding: { type: "integer", notNull: true, default: 6 },
    restart_yearly: { type: "boolean", notNull: true, default: false },
    last_reset_year: { type: "integer" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("number_series", "number_series_org_entity_unique", {
    unique: ["organization_id", "entity_key"],
  });
};

exports.down = (pgm) => {
  pgm.dropTable("number_series", { ifExists: true, cascade: true });
};
