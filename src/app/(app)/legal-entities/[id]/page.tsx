import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Pencil, Building2 } from "lucide-react";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";
import { query, queryOne } from "@/lib/db";
import { titleCase } from "@/lib/format";

interface LegalEntityRow {
  id: string;
  entity_name: string;
  entity_name_arabic: string | null;
  email: string | null;
  phone: string | null;
  registration_num: string | null;
  description: string | null;
}

interface ProjectRow {
  id: string;
  name: string;
  code: string | null;
  status: string;
  city: string | null;
  country: string | null;
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm text-ink-700">{value || "-"}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone = status === "ready" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{titleCase(status)}</span>;
}

// Read-only detail view — clicking a Legal Entity's name in the list now lands here instead of
// straight on the edit form (see entities.ts's hasDetailView flag). Editing moves one level
// deeper to /legal-entities/[id]/edit. The reason this exists at all, beyond matching the
// Buildings/Projects/Units precedent: showing which Projects currently point at this Legal
// Entity (projects.legal_entity_id — see migrations/1778000000000_legal_entities.js) needs a
// dedicated query the generic edit form has no place to render.
export default async function LegalEntityDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireActiveContext();
  await requireModuleAccess(ctx, "legal-entities", "view");

  const legalEntity = await queryOne<LegalEntityRow>(
    `SELECT id, entity_name, entity_name_arabic, email, phone, registration_num, description
     FROM legal_entities WHERE id = $1 AND organization_id = $2`,
    [params.id, ctx.orgId]
  );
  if (!legalEntity) notFound();

  const projects = await query<ProjectRow>(
    `SELECT id, name, code, status, city, country
     FROM projects WHERE legal_entity_id = $1 AND organization_id = $2
     ORDER BY created_at DESC`,
    [params.id, ctx.orgId]
  );

  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/legal-entities" className="mb-2 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600">
          <ChevronLeft size={12} /> Legal Entities
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-ink-800">{legalEntity.entity_name}</h1>
          <Link href={`/legal-entities/${legalEntity.id}/edit`} className="btn-secondary">
            <Pencil size={14} /> Edit
          </Link>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className="card p-6">
          <h2 className="mb-4 text-sm font-semibold text-ink-800">Legal Entity Details</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Entity Name Arabic" value={legalEntity.entity_name_arabic} />
            <Field label="Email" value={legalEntity.email} />
            <Field label="Phone" value={legalEntity.phone} />
            <Field label="Registration Num" value={legalEntity.registration_num} />
          </div>

          {legalEntity.description && (
            <div className="mt-4 border-t border-gray-100 pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Description</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink-700">{legalEntity.description}</p>
            </div>
          )}
        </div>

        <div className="card">
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-ink-800">Projects ({projects.length})</h2>
          </div>
          {projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <Building2 size={28} className="text-gray-300" />
              <p className="text-sm text-gray-500">No projects under this legal entity yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-2.5">Name</th>
                    <th className="px-4 py-2.5">Code</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">City</th>
                    <th className="px-4 py-2.5">Country</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {projects.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <Link href={`/projects/${p.id}`} className="font-medium text-brand-600 hover:underline">
                          {p.name}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-ink-700">{p.code || "-"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <StatusPill status={p.status} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-ink-700">{p.city || "-"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-ink-700">{p.country || "-"}</td>
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
