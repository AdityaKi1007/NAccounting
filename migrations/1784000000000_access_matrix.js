// Extends the existing per-org custom-role permission model (role_permissions.can_view /
// can_write, from the 2026-09-12 Super Admin / Access Control feature) with a proper 10-level
// access scheme — No Access, Read/Write/Full x Own/Team/All — to back the new "Access Matrix"
// settings screen. Additive only: can_view/can_write are kept (still derived from access_level
// on every write, for anything that might still read them) rather than dropped, matching this
// project's non-destructive-migration convention.
//
// NOTE on scope: "Own" and "Team" are accepted and stored here so the UI can offer the full
// scheme the user asked for, but NeoAccounting has no creator/owner tracking on records and no
// team/manager hierarchy today — building that is a much larger, separate effort. Until it
// exists, module-access.ts's capabilities() mapping (src/lib/access-levels.ts) treats
// read_own/read_team/read_all identically (and likewise for write_*/full_*) — this is a
// deliberate, documented simplification, not a bug.
exports.up = (pgm) => {
  pgm.addColumns("role_permissions", {
    access_level: {
      type: "text",
      notNull: true,
      default: "no_access",
    },
  });
  pgm.addConstraint("role_permissions", "role_permissions_access_level_check", {
    check:
      "access_level IN ('no_access','read_own','read_team','read_all','write_own','write_team','write_all','full_own','full_team','full_all')",
  });
  // Backfill any pre-existing rows (there are none live today — the custom-roles feature was
  // retired the day before this migration and role_permissions was empty at that time — but
  // this keeps the migration correct/idempotent if ever run against a database that does have
  // old rows) from the old two-flag model into the nearest equivalent new level.
  pgm.sql(`
    UPDATE role_permissions
    SET access_level = CASE
      WHEN can_write THEN 'full_all'
      WHEN can_view THEN 'read_all'
      ELSE 'no_access'
    END
  `);
};

exports.down = (pgm) => {
  pgm.dropConstraint("role_permissions", "role_permissions_access_level_check");
  pgm.dropColumns("role_permissions", ["access_level"]);
};
