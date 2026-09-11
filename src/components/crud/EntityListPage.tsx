import { getEntity } from "@/lib/entities";
import { listRows, loadRefOptions } from "@/lib/crud";
import { requireActiveContext } from "@/lib/session";
import { processDueJournalReversals } from "@/lib/journal-reversals";
import { notFound } from "next/navigation";
import PageHeader from "@/components/crud/PageHeader";
import DataTable from "@/components/crud/DataTable";

export default async function EntityListPage({ entityKey }: { entityKey: string }) {
  const entity = getEntity(entityKey);
  if (!entity) notFound();

  const ctx = await requireActiveContext();
  // Lazily auto-publishes any reversing journal whose reverse date has arrived (see
  // src/lib/journal-reversals.ts) — this app has no cron runner, so a visit to the Manual
  // Journals list is one of the few places that check can happen.
  if (entity.kind === "journal") await processDueJournalReversals(ctx.orgId);
  const [rows, refOptions] = await Promise.all([
    listRows(entityKey, ctx.orgId),
    loadRefOptions(entity, ctx.orgId, ctx.memberships),
  ]);

  return (
    <div>
      <PageHeader
        title={entity.labelPlural}
        newHref={entity.customNewHref ?? (entity.restrictedCrud ? undefined : `/${entityKey}/new`)}
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
              : `No ${entity.labelPlural.toLowerCase()} yet. Click "New ${entity.label}" to add your first one.`
          }
          entityKind={entity.kind}
          titleField={entity.titleField}
          hasDetailView={entity.hasDetailView}
          restrictedCrud={entity.restrictedCrud}
          disableTitleLink={entity.disableTitleLink}
        />
      </div>
    </div>
  );
}
