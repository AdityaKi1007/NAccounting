/* eslint-disable */
exports.shorthands = undefined;

// A dedicated per-organization sequence guarantees a distinct, never-reused counter for
// every tenant (unlike hashing the UUID, which only makes collisions unlikely). The
// counter itself is sequential (1, 2, 3, ...); the app layer scrambles it into a
// non-sequential-looking 9-digit ID via a bijective transform, so the raw signup order
// isn't exposed while uniqueness stays guaranteed by the database.

exports.up = (pgm) => {
  pgm.sql(`CREATE SEQUENCE organizations_org_seq_seq;`);
  pgm.addColumns("organizations", {
    org_seq: { type: "bigint", notNull: true, default: pgm.func("nextval('organizations_org_seq_seq')") },
  });
  pgm.sql(`ALTER SEQUENCE organizations_org_seq_seq OWNED BY organizations.org_seq;`);
  pgm.addConstraint("organizations", "organizations_org_seq_unique", { unique: ["org_seq"] });
};

exports.down = (pgm) => {
  pgm.dropColumns("organizations", ["org_seq"]);
  pgm.sql(`DROP SEQUENCE IF EXISTS organizations_org_seq_seq;`);
};
