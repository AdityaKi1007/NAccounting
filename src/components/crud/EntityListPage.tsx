import { getEntity } from "@/lib/entities";
import { listRows, loadRefOptions } from "@/lib/crud";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess, canManageOrgSettings } from "@/lib/module-access";
import { processDueJournalReversals } from "@/lib/journal-reversals";
import { notFound } from "next/navigation";
import PageHeader from "@/components/crud/PageHeader";
import DataTable from "@/components/crud/DataTable";

export default async function EntityListPage({ entityKey }: { entityKey: string }) {
  const entity = getEntity(entityKey);
  if (!entity) notFound();

  const ctx = await requireActiveContext();
  await requireModuleAccess(ctx, entityKey, "view");
  // Lazily auto-publishes any reversing journal whose reverse date has arrived (see
  // src/lib/journal-reversals.ts) — this app has no cron runner, so a visit to the Manual
  // Journals list is one of the few places that check can happen.
  if (entity.kind === "journal") await processDueJournalReversals(ctx.orgId);
  // See EntityFormPage.tsx for the New/Edit-page half of this — this is the List-page half:
  // adminOnly entities (currencies/payment-terms/tax-rates/revenue-recognition-rules/roles)
  // hide the "+ New" button and disable row Edit/Delete for anyone who isn't an owner/admin/
  // Super Admin, but the list itself still renders normally (read-only access, not no access).
  const readOnly = Boolean(entity.adminOnly) && !canManageOrgSettings(ctx);

  const [rows, refOptions] = await Promise.all([
    listRows(entityKey, ctx.orgId),
    loadRefOptions(entity, ctx.orgId, ctx.memberships),
  ]);

  return (
    <div>
      <PageHeader
        title={entity.labelPlural}
        newHref={readOnly ? undefined : entity.customNewHref ?? (entity.restrictedCrud ? undefined : `/${entityKey}/new`)}
        newLabel={`New ${entity.label}`}
      />
      <div className="m-6 card">
        <DataTable
          entityKey={entityKey}
          rows={rows as Record<string, unknown>[]}
          columns={entity.listColumns}
          fields={entity.fields}
          refOptions={refOptions}
          emptyLabel={
            entity.restrictedCrud && !entity.customNewHref
              ? `No ${entity.labelPlural.toLowerCase()} yet.`
              : readOnly
              ? `No ${entity.labelPlural.toLowerCase()} yet.`
              : `No ${entity.labelPlural.toLowerCase()} yet. Click "New ${entity.label}" to add your first one.`
          }
          entityKind={entity.kind}
          titleField={entity.titleField}
          hasDetailView={entity.hasDetailView}
          restrictedCrud={entity.restrictedCrud}
          disableTitleLink={entity.disableTitleLink}
          readOnly={readOnly}
        />
      </div>
    </div>
  );
}
