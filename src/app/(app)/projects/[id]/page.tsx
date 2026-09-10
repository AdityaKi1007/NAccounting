import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Pencil, Building2 } from "lucide-react";
import { requireActiveContext } from "@/lib/session";
import { query, queryOne } from "@/lib/db";
import { formatDate } from "@/lib/format";

interface ProjectRow {
  id: string;
  name: string;
  organization_name: string;
  code: string | null;
  rera_project_name: string | null;
  status: string;
  plot_area: number | string | null;
  project_arabic_name: string | null;
  rera_number: string | null;
  estimated_completion_date: string | null;
  completion_date: string | null;
  description: string | null;
  project_address: string | null;
  country: string | null;
  city: string | null;
}

interface BuildingRow {
  id: string;
  name: string;
  code: string | null;
  estimated_handover_date: string | null;
  actual_handover_date: string | null;
}

function StatusPill({ status }: { status: string }) {
  const tone = status === "ready" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700";
  const label = status === "ready" ? "Ready" : "Offplan";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span>;
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm text-ink-700">{value || "-"}</p>
    </div>
  );
}

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireActiveContext();

  const project = await queryOne<ProjectRow>(
    `SELECT p.id, p.name, o.name AS organization_name, p.code, p.rera_project_name, p.status, p.plot_area,
            p.project_arabic_name, p.rera_number, p.estimated_completion_date, p.completion_date,
            p.description, p.project_address, p.country, p.city
     FROM projects p
     JOIN organizations o ON o.id = p.organization_id
     WHERE p.id = $1 AND p.organization_id = $2`,
    [params.id, ctx.orgId]
  );
  if (!project) notFound();

  const buildings = await query<BuildingRow>(
    `SELECT id, name, code, estimated_handover_date, actual_handover_date
     FROM buildings WHERE project_id = $1 AND organization_id = $2
     ORDER BY created_at DESC`,
    [params.id, ctx.orgId]
  );

  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/projects" className="mb-2 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600">
          <ChevronLeft size={12} /> Projects
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-ink-800">{project.name}</h1>
            <StatusPill status={project.status} />
          </div>
          <Link href={`/projects/${project.id}/edit`} className="btn-secondary">
            <Pencil size={14} /> Edit
          </Link>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className="card p-6">
          <h2 className="mb-4 text-sm font-semibold text-ink-800">Project Details</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Organization" value={project.organization_name} />
            <Field label="Code" value={project.code} />
            <Field label="Rera Project Name" value={project.rera_project_name} />
            <Field label="Rera Number" value={project.rera_number} />
            <Field label="Plot Area" value={project.plot_area != null ? String(project.plot_area) : null} />
            <Field label="Project Arabic Name" value={project.project_arabic_name} />
            <Field label="Country" value={project.country} />
            <Field label="City" value={project.city} />
            <Field
              label="Estimated Completion Date"
              value={project.estimated_completion_date ? formatDate(project.estimated_completion_date) : null}
            />
            <Field label="Completion Date" value={project.completion_date ? formatDate(project.completion_date) : null} />
          </div>

          {project.project_address && (
            <div className="mt-4 border-t border-gray-100 pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Project Address</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink-700">{project.project_address}</p>
            </div>
          )}
          {project.description && (
            <div className="mt-4 border-t border-gray-100 pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Description</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink-700">{project.description}</p>
            </div>
          )}
        </div>

        <div className="card">
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-ink-800">Buildings ({buildings.length})</h2>
          </div>
          {buildings.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <Building2 size={28} className="text-gray-300" />
              <p className="text-sm text-gray-500">No buildings under this project yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-2.5">Name</th>
                    <th className="px-4 py-2.5">Code</th>
                    <th className="px-4 py-2.5">Estimated Handover</th>
                    <th className="px-4 py-2.5">Actual Handover</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {buildings.map((b) => (
                    <tr key={b.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <Link href={`/buildings/${b.id}`} className="font-medium text-brand-600 hover:underline">
                          {b.name}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-ink-700">{b.code || "-"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-ink-700">{formatDate(b.estimated_handover_date)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-ink-700">{formatDate(b.actual_handover_date)}</td>
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
