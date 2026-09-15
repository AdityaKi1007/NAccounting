/* eslint-disable */
exports.shorthands = undefined;

// Relaxes `inventory.building_id` (a Unit's Building) from NOT NULL to nullable, so the new
// /api/v1/units create/update endpoints can accept a Unit with no Building assigned yet — e.g.
// an off-plan reservation made before the specific building/tower within a project has been
// finalized, or a villa-community project that has no Building tier at all between Project and
// Unit. `project_id` stays NOT NULL/required — every Unit still belongs to exactly one Project,
// only the Building level becomes optional.
//
// Deliberately app-layer only, not also flipping entities.ts's internal EntityForm's
// `required: true` on this field — the in-app "New Unit"/"Edit Unit" form still requires
// picking a Building (existing data-entry convention for units created by hand); only the v1
// API treats it as optional, for external integrations that may know a unit before its
// building assignment does. See src/app/api/v1/units/route.ts's own header comment.
exports.up = (pgm) => {
  pgm.alterColumn("inventory", "building_id", { notNull: false });
};

exports.down = (pgm) => {
  // Down migration intentionally does NOT restore NOT NULL — any Unit created via the API
  // without a building in the meantime would violate it, silently breaking the rollback. Left
  // nullable; a future forward-fix can re-tighten it once (if ever) every existing row has a
  // building assigned.
};
