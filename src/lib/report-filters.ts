import { query } from "@/lib/db";

// Shared helpers for the new Project/Unit filter added across the Reports section. Every
// report that can be meaningfully sliced by Project/Unit reads its selection from
// ?projectId=&?unitId= (alongside the existing ?from=/?to=/?asOf= params) and renders the
// two dropdowns via ReportDateRangeBar/ReportAsOfBar's own optional projects/units props.

export interface ReportFilterOption {
  id: string;
  name: string;
}

/** The org's Projects and Units, for the filter dropdowns. Plain flat entities (see
 * entities.ts) — no pagination needed, matching every other ref-select dropdown in the app. */
export async function loadProjectUnitOptions(
  orgId: string
): Promise<{ projects: ReportFilterOption[]; units: ReportFilterOption[] }> {
  const [projects, units] = await Promise.all([
    query<ReportFilterOption>(`SELECT id, name FROM projects WHERE organization_id = $1 ORDER BY name`, [orgId]),
    query<ReportFilterOption>(`SELECT id, name FROM inventory WHERE organization_id = $1 ORDER BY name`, [orgId]),
  ]);
  return { projects, units };
}

/** The org's Vendors, for the Payments Made report's Vendor filter dropdown — same shape and
 * reasoning as loadProjectUnitOptions above. */
export async function loadVendorOptions(orgId: string): Promise<ReportFilterOption[]> {
  return query<ReportFilterOption>(
    `SELECT id, display_name AS name FROM vendors WHERE organization_id = $1 ORDER BY display_name`,
    [orgId]
  );
}

/** The org's Customers, for the Payments Received report's Customer filter dropdown. */
export async function loadCustomerOptions(orgId: string): Promise<ReportFilterOption[]> {
  return query<ReportFilterOption>(
    `SELECT id, display_name AS name FROM customers WHERE organization_id = $1 ORDER BY display_name`,
    [orgId]
  );
}

/** Normalizes a raw ?projectId=/?unitId= value to a real id or null. The dropdown's "All
 * Projects"/"All Units" option submits an empty string, which must become `null` (not `""`)
 * before reaching a `$N::uuid` query parameter — Postgres rejects `''` as an invalid uuid,
 * where `null` correctly short-circuits the `$N::uuid IS NULL OR ...` filter to "no filter". */
export function normalizeFilterId(value: string | undefined): string | null {
  return value && value.trim() !== "" ? value : null;
}
