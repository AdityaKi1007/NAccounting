import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Pencil, Home } from "lucide-react";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";
import { query, queryOne } from "@/lib/db";
import { formatCurrency, formatDate, titleCase } from "@/lib/format";

interface BuildingRow {
  id: string;
  name: string;
  code: string | null;
  actual_handover_date: string | null;
  estimated_handover_date: string | null;
  project_id: string;
}

interface ProjectRef {
  id: string;
  name: string;
}

interface UnitRow {
  id: string;
  name: string;
  code: string | null;
  floor: string | null;
  area: number | string | null;
  listed_price: number | string | null;
  status: string;
  unit_type: string | null;
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm text-ink-700">{value || "-"}</p>
    </div>
  );
}

function UnitStatusPill({ status }: { status: string }) {
  const tone =
    {
      sold: "bg-green-50 text-green-700",
      available: "bg-blue-50 text-blue-700",
      reserved: "bg-amber-50 text-amber-700",
      cancelled: "bg-red-50 text-red-700",
    }[status] ?? "bg-gray-100 text-gray-600";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{titleCase(status)}</span>;
}

export default async function BuildingDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireActiveContext();
  await requireModuleAccess(ctx, "buildings", "view");

  const building = await queryOne<BuildingRow>(
    `SELECT id, name, code, actual_handover_date, estimated_handover_date, project_id
     FROM buildings WHERE id = $1 AND organization_id = $2`,
    [params.id, ctx.orgId]
  );
  if (!building) notFound();

  const [project, units, org] = await Promise.all([
    queryOne<ProjectRef>(`SELECT id, name FROM projects WHERE id = $1 AND organization_id = $2`, [building.project_id, ctx.orgId]),
    query<UnitRow>(
      `SELECT id, name, code, floor, area, listed_price, status, unit_type
       FROM inventory WHERE building_id = $1 AND organization_id = $2
       ORDER BY created_at DESC`,
      [params.id, ctx.orgId]
    ),
    queryOne<{ currency: string }>(`SELECT currency FROM organizations WHERE id = $1`, [ctx.orgId]),
  ]);
  const currency = org?.currency ?? "AED";

  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/buildings" className="mb-2 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600">
          <ChevronLeft size={12} /> Buildings
        </Link>
        <div className="flex items-center justify-between">
          <div>
            {project && (
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                <Link href={`/projects/${project.id}`} className="hover:text-brand-600 hover:underline">
                  {project.name}
                </Link>
              </p>
            )}
            <h1 className="text-lg font-semibold text-ink-800">{building.name}</h1>
          </div>
          <Link href={`/buildings/${building.id}/edit`} className="btn-secondary">
            <Pencil size={14} /> Edit
          </Link>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className="card p-6">
          <h2 className="mb-4 text-sm font-semibold text-ink-800">Building Details</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Code" value={building.code} />
            <Field label="Project" value={project?.name ?? null} />
            <Field label="Estimated Handover Date" value={building.estimated_handover_date ? formatDate(building.estimated_handover_date) : null} />
            <Field label="Actual Handover Date" value={building.actual_handover_date ? formatDate(building.actual_handover_date) : null} />
          </div>
        </div>

        <div className="card">
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-ink-800">Units ({units.length})</h2>
          </div>
          {units.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <Home size={28} className="text-gray-300" />
              <p className="text-sm text-gray-500">No units under this building yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-2.5">Name</th>
                    <th className="px-4 py-2.5">Code</th>
                    <th className="px-4 py-2.5">Floor</th>
                    <th className="px-4 py-2.5">Unit Type</th>
                    <th className="px-4 py-2.5 text-right">Listed Price</th>
                    <th className="px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {units.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <Link href={`/inventory/${u.id}`} className="font-medium text-brand-600 hover:underline">
                          {u.name}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-ink-700">{u.code || "-"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-ink-700">{u.floor || "-"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-ink-700">{u.unit_type ? titleCase(u.unit_type) : "-"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-ink-800">{formatCurrency(u.listed_price, currency)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <UnitStatusPill status={u.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
