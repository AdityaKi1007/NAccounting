import { getEntity } from "@/lib/entities";
import { getRow, loadRefOptions } from "@/lib/crud";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";
import { notFound } from "next/navigation";
import PageHeader from "@/components/crud/PageHeader";
import EntityForm from "@/components/crud/EntityForm";

export default async function EntityFormPage({
  entityKey,
  id,
}: {
  entityKey: string;
  id?: string;
}) {
  const entity = getEntity(entityKey);
  if (!entity) notFound();

  const ctx = await requireActiveContext();
  await requireModuleAccess(ctx, entityKey, "write");
  const [refOptions, row] = await Promise.all([
    loadRefOptions(entity, ctx.orgId, ctx.memberships, id),
    id ? getRow(entityKey, ctx.orgId, id) : Promise.resolve(null),
  ]);

  if (id && !row) notFound();

  // New record: default any real organization_id field (currently only Projects — see
  // entities.ts) to the org the user is currently in, same as every other field's `default`.
  const initialData = row
    ? (row as Record<string, unknown>)
    : entity.fields.some((f) => f.name === "organization_id")
    ? { organization_id: ctx.orgId }
    : null;

  return (
    <div>
      <PageHeader
        title={id ? `Edit ${entity.label}` : `New ${entity.label}`}
        subtitle={id ? `Update this ${entity.label.toLowerCase()}` : `Add a new ${entity.label.toLowerCase()} to ${entity.labelPlural.toLowerCase()}`}
      />
      <div className="m-6 card max-w-3xl p-6">
        <EntityForm
          entityKey={entityKey}
          fields={entity.fields}
          refOptions={refOptions}
          initialData={initialData as Record<string, unknown> | null}
          recordId={id}
          redirectTo={`/${entityKey}`}
          allowAttachments={entity.attachments}
        />
      </div>
    </div>
  );
}
