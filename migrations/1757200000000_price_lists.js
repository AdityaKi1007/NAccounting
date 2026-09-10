/* eslint-disable */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("price_lists", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: { type: "uuid", notNull: true, references: "organizations", onDelete: "cascade" },
    name: { type: "text", notNull: true },
    transaction_type: { type: "text", notNull: true, default: "sales" }, // sales | purchase
    price_list_type: { type: "text", notNull: true, default: "all_items" }, // all_items | individual_items
    description: { type: "text" },
    percentage_type: { type: "text", notNull: true, default: "markup" }, // markup | markdown
    percentage_value: { type: "numeric", notNull: true, default: 0 },
    round_off_to: { type: "text", notNull: true, default: "never_mind" },
    is_active: { type: "boolean", notNull: true, default: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("price_lists", "organization_id");
};

exports.down = (pgm) => {
  pgm.dropTable("price_lists", { ifExists: true, cascade: true });
};
