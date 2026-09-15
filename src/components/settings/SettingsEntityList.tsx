import Link from "next/link";
import { Plus } from "lucide-react";
import { getEntity } from "@/lib/entities";
import { listRows, loadRefOptions } from "@/lib/crud";
import { notFound } from "next/navigation";
import DataTable from "@/components/crud/DataTable";

/**
 * Embeds a flat entity's list (table + New button) inside a settings sub-page, reusing the
 * same generic /[slug] list/create/edit/delete routes rather than duplicating them — the
 * settings page just gives it a home under Roles / Currencies / Payment Terms.
 */
export default async function SettingsEntityList({
  entityKey,
  orgId,
  canManage = true,
}: {
  entityKey: string;
  orgId: string;
  /** Caller-computed via canManageOrgSettings(ctx) — false hides the "+ New" button and makes
   * the embedded DataTable read-only (no Edit/Delete, plain-text title). Defaults to true so
   * any not-yet-updated caller keeps today's behavior. */
  canManage?: boolean;
}) {
  const entity = getEntity(entityKey);
  if (!entity) notFound();

  const [rows, refOptions] = await Promise.all([
    listRows(entityKey, orgId),
    loadRefOptions(entity, orgId),
  ]);

  return (
    <div>
      {canManage && (
        <div className="mb-4 flex justify-end">
          <Link href={`/${entityKey}/new`} className="btn-primary">
            <Plus size={16} /> New {entity.label}
          </Link>
        </div>
      )}
      <div className="card">
        <DataTable
          entityKey={entityKey}
          rows={rows as Record<string, unknown>[]}
          columns={entity.listColumns}
          fields={entity.fields}
          refOptions={refOptions}
          emptyLabel={
            canManage
              ? `No ${entity.labelPlural.toLowerCase()} yet. Click "New ${entity.label}" to add your first one.`
              : `No ${entity.labelPlural.toLowerCase()} yet.`
          }
          entityKind={entity.kind}
          readOnly={!canManage}
        />
      </div>
    </div>
  );
}
