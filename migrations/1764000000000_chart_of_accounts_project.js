/* eslint-disable */
exports.shorthands = undefined;

// Lets a Chart of Accounts entry optionally be tagged with a Property Master Project (see
// migration 1759300000000_property_master.js) — e.g. a project-specific bank account or a
// cost-center-style account a user wants to track against one project. Nullable and
// `ON DELETE SET NULL`: unlike Buildings/Units (a true composition hierarchy under a
// Project), an account's usefulness doesn't depend on the project still existing, so deleting
// a Project should just clear the tag, not touch the account or its GL history at all.
exports.up = (pgm) => {
  pgm.addColumn('accounts', {
    project_id: { type: 'uuid', references: 'projects', onDelete: 'set null' },
  });
  pgm.createIndex('accounts', 'project_id');
};

exports.down = (pgm) => {
  pgm.dropColumn('accounts', 'project_id');
};
