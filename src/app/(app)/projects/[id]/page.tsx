import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Pencil, Building2, Landmark } from "lucide-react";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";
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
  legal_entity_id: string | null;
  legal_entity_name: string | null;
}

interface BuildingRow {
  id: string;
  name: string;
  code: string | null;
  estimated_handover_date: string | null;
  actual_handover_date: string | null;
}

interface OtherChargeRow {
  id: string;
  category: string;
  calculation_basis: string | null;
  aed_psqft: number | string | null;
  aed_mn: number | string | null;
  pct_gross_outflow: number | string | null;
}

interface BankAccountRow {
  id: string;
  account_name: string;
  account_type: string;
  bank_name: string | null;
  account_number: string | null;
  currency: string;
  is_primary: boolean;
}

// Plain numeric display for Other Charges' rate/amount/percent columns — these are real-estate
// metrics (a psqft rate, a value already expressed in millions, a share of gross outflow), not
// document totals, so formatCurrency's currency-code styling would be a mismatch; the unit is
// already carried by each column header instead (AED (psqft) / AED Mn / % of Gross Outflow).
function formatMetric(value: number | string | null, suffix = "") {
  if (value === null || value === undefined || value === "") return "-";
  const n = typeof value === "number" ? value : parseFloat(value);
  if (!Number.isFinite(n)) return "-";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n)}${suffix}`;
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
  await requireModuleAccess(ctx, "projects", "view");

  const project = await queryOne<ProjectRow>(
    `SELECT p.id, p.name, o.name AS organization_name, p.code, p.rera_project_name, p.status, p.plot_area,
            p.project_arabic_name, p.rera_number, p.estimated_completion_date, p.completion_date,
            p.description, p.project_address, p.country, p.city, p.legal_entity_id, le.entity_name AS legal_entity_name
     FROM projects p
     JOIN organizations o ON o.id = p.organization_id
     LEFT JOIN legal_entities le ON le.id = p.legal_entity_id
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

  const otherCharges = await query<OtherChargeRow>(
    `SELECT id, category, calculation_basis, aed_psqft, aed_mn, pct_gross_outflow
     FROM other_charges WHERE project_id = $1 AND organization_id = $2
     ORDER BY created_at DESC`,
    [params.id, ctx.orgId]
  );

  // Bank/credit-card accounts tagged to this project (see bank_accounts.project_id,
  // migration 1789000000000_bank_accounts_project_tag.js / BankAccountModal.tsx's own
  // Project select) — the reverse direction of that same tag, surfaced here as a related list
  // the same way Buildings and Other Charges already are.
  const bankAccounts = await query<BankAccountRow>(
    `SELECT id, account_name, account_type, bank_name, account_number, currency, is_primary
     FROM bank_accounts WHERE project_id = $1 AND organization_id = $2
     ORDER BY is_primary DESC, created_at DESC`,
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
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Legal Entity</p>
              {project.legal_entity_id ? (
                <Link
                  href={`/legal-entities/${project.legal_entity_id}`}
                  className="mt-0.5 block text-sm text-brand-600 hover:underline"
                >
                  {project.legal_entity_name || "-"}
                </Link>
              ) : (
                <p className="mt-0.5 text-sm text-ink-700">-</p>
              )}
            </div>
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

        <div className="card">
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-ink-800">Banks ({bankAccounts.length})</h2>
          </div>
          {bankAccounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <Landmark size={28} className="text-gray-300" />
              <p className="text-sm text-gray-500">No bank or credit card accounts tagged to this project yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-2.5">Account Name</th>
                    <th className="px-4 py-2.5">Type</th>
                    <th className="px-4 py-2.5">Bank Name</th>
                    <th className="px-4 py-2.5">Account Number</th>
                    <th className="px-4 py-2.5">Currency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {bankAccounts.map((b) => (
                    <tr key={b.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <Link href="/banking" className="font-medium text-brand-600 hover:underline">
                          {b.account_name}
                        </Link>
                        {b.is_primary && (
                          <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-600">Primary</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-ink-700">
                        {b.account_type === "credit_card" ? "Credit Card" : "Bank"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-ink-700">{b.bank_name || "-"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-ink-700">{b.account_number || "-"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-ink-700">{b.currency}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-ink-800">Other Charges ({otherCharges.length})</h2>
          </div>
          {otherCharges.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <Building2 size={28} className="text-gray-300" />
              <p className="text-sm text-gray-500">No other charges under this project yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-2.5">Category</th>
                    <th className="px-4 py-2.5">Calculation Basis</th>
                    <th className="px-4 py-2.5">AED (psqft)</th>
                    <th className="px-4 py-2.5">AED Mn</th>
                    <th className="px-4 py-2.5">% of Gross Outflow</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {otherCharges.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <Link href={`/other-charges/${c.id}`} className="font-medium text-brand-600 hover:underline">
                          {c.category}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-ink-700">{c.calculation_basis || "-"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-ink-700">{formatMetric(c.aed_psqft)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-ink-700">{formatMetric(c.aed_mn)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-ink-700">{formatMetric(c.pct_gross_outflow, "%")}</td>
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
