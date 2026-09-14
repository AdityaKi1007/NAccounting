// The 10-level access scheme shown in the Access Matrix (Settings → Users & Roles), grouped
// as No Access, then Read/Write/Full crossed with Own/Team/All — matching the reference CRM
// screenshots this feature was requested from.
//
// IMPORTANT SCOPE NOTE: NeoAccounting has no creator/owner tracking on records and no
// team/manager hierarchy today (adding both is a separate, much larger effort). So while every
// level below is selectable and saved, enforcement (capabilities()) can only act on the
// Read/Write/Full tier for now — Own, Team and All within a tier all behave identically until
// that infrastructure exists. This was a deliberate scoping decision, not an oversight; see
// the Access Matrix addendum doc for the full history.
export type AccessLevel =
  | "no_access"
  | "read_own"
  | "read_team"
  | "read_all"
  | "write_own"
  | "write_team"
  | "write_all"
  | "full_own"
  | "full_team"
  | "full_all";

export const ACCESS_LEVELS: { value: AccessLevel; label: string; group: string }[] = [
  { value: "no_access", label: "No Access", group: "" },
  { value: "read_own", label: "Read Own", group: "Read" },
  { value: "read_team", label: "Read Team", group: "Read" },
  { value: "read_all", label: "Read All", group: "Read" },
  { value: "write_own", label: "Write Own", group: "Write" },
  { value: "write_team", label: "Write Team", group: "Write" },
  { value: "write_all", label: "Write All", group: "Write" },
  { value: "full_own", label: "Full Own", group: "Full" },
  { value: "full_team", label: "Full Team", group: "Full" },
  { value: "full_all", label: "Full All", group: "Full" },
];

export const ACCESS_LEVEL_VALUES = new Set(ACCESS_LEVELS.map((l) => l.value));

export function isAccessLevel(value: unknown): value is AccessLevel {
  return typeof value === "string" && ACCESS_LEVEL_VALUES.has(value as AccessLevel);
}

export interface AccessCapabilities {
  view: boolean;
  write: boolean;
  delete: boolean;
}

/**
 * Maps a stored access_level down to what NeoAccounting can actually enforce today: whether
 * the module can be viewed, written to (create/update), and deleted from. Own/Team/All within
 * a tier collapse to the same capabilities (see the scope note above) — read_own, read_team
 * and read_all are all view-only, and so on.
 */
export function capabilitiesOf(level: string | null | undefined): AccessCapabilities {
  if (!level || level === "no_access") return { view: false, write: false, delete: false };
  if (level.startsWith("read_")) return { view: true, write: false, delete: false };
  if (level.startsWith("write_")) return { view: true, write: true, delete: false };
  if (level.startsWith("full_")) return { view: true, write: true, delete: true };
  return { view: false, write: false, delete: false };
}

/** Derives the legacy can_view/can_write flags from an access_level, for the columns kept
 * around for backward compatibility (see the access_matrix migration). */
export function legacyFlagsOf(level: string): { can_view: boolean; can_write: boolean } {
  const caps = capabilitiesOf(level);
  return { can_view: caps.view, can_write: caps.write };
}
