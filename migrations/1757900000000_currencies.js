/* eslint-disable */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("currencies", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: { type: "uuid", notNull: true, references: "organizations", onDelete: "cascade" },
    code: { type: "text", notNull: true },
    name: { type: "text", notNull: true },
    symbol: { type: "text" },
    exchange_rate: { type: "numeric" }, // relative to the org's base currency; left blank until the org sets it
    as_of_date: { type: "date" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("currencies", "organization_id");

  // Seed each existing org with its own base currency plus the common set shown in the
  // Zoho reference screenshot, so the list isn't empty on first visit.
  pgm.sql(`
    INSERT INTO currencies (organization_id, code, name, symbol)
    SELECT o.id, o.currency, c.name, c.symbol
    FROM organizations o
    JOIN (
      VALUES
        ('AED', 'UAE Dirham', 'AED'),
        ('USD', 'US Dollar', '$'),
        ('EUR', 'Euro', '€'),
        ('GBP', 'British Pound', '£'),
        ('INR', 'Indian Rupee', '₹')
    ) AS c(code, name, symbol) ON c.code = o.currency
  `);

  pgm.sql(`
    INSERT INTO currencies (organization_id, code, name, symbol)
    SELECT o.id, c.code, c.name, c.symbol
    FROM organizations o
    CROSS JOIN (
      VALUES
        ('AUD', 'Australian Dollar', '$'),
        ('BND', 'Brunei Dollar', '$'),
        ('CAD', 'Canadian Dollar', '$'),
        ('CNY', 'Yuan Renminbi', 'CNY'),
        ('EUR', 'Euro', '€'),
        ('GBP', 'British Pound', '£'),
        ('INR', 'Indian Rupee', '₹'),
        ('JPY', 'Japanese Yen', '¥'),
        ('SAR', 'Saudi Riyal', 'SAR'),
        ('USD', 'US Dollar', '$'),
        ('ZAR', 'South African Rand', 'R')
    ) AS c(code, name, symbol)
    WHERE c.code <> o.currency
  `);
};

exports.down = (pgm) => {
  pgm.dropTable("currencies", { ifExists: true, cascade: true });
};
