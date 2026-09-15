import { getEntity } from "@/lib/entities";
import { getRow, loadRefOptions } from "@/lib/crud";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess, canManageOrgSettings } from "@/lib/module-access";
import { notFound } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import PageHeader from "@/components/crud/PageHeader";
import EntityForm from "@/components/crud/EntityForm";

export default async function EntityFormPage({
  entityKey,
  id,
  presetValues,
  redirectTo,
}: {
  entityKey: string;
  id?: string;
  /** Values to pre-fill on a NEW record only (e.g. `{ project_id }` when arriving from a
   *  parent's "+ Add" button — see /buildings/new/page.tsx and the Buildings card on
   *  /projects/[id]). Ignored when editing an existing row (its own saved values win). */
  presetValues?: Record<string, string>;
  /** Where to send the user after a successful save. Defaults to `/${entityKey}` — a parent
   *  "+ Add" button overrides this to return to the parent record instead. */
  redirectTo?: string;
}) {
  const entity = getEntity(entityKey);
  if (!entity) notFound();

  const ctx = await requireActiveContext();
  await requireModuleAccess(ctx, entityKey, "write");

  // adminOnly entities (currencies/payment-terms/tax-rates/revenue-recognition-rules/roles —
  // see entities.ts) are read-only for anyone who isn't an owner/admin/Super Admin. The API
  // already rejects a write (see /api/entities/[entity]/route.ts), but reaching the New/Edit
  // page at all would still show a fully-live form until a save failed with a 403 — so this
  // blocks the page itself, same "Owner and Admin Only" card pattern as Audit Logs/Access
  // Matrix/Debug Logs (settings/[group]/[item]/page.tsx). The entity's List page still renders
  // for everyone (that's the "read only" part of read-only access).
  if (entity.adminOnly && !canManageOrgSettings(ctx)) {
    return (
      <div>
        <PageHeader title={id ? `Edit ${entity.label}` : `New ${entity.label}`} />
        <div className="m-6 card flex flex-col items-center justify-center gap-3 py-24 text-center">
          <ShieldAlert size={40} className="text-gray-300" />
          <h2 className="text-base font-semibold text-ink-800">Owner and Admin Only</h2>
          <p className="max-w-sm text-sm text-gray-500">
            {entity.labelPlural} can only be changed by your organization&apos;s Owner, Admin, or a Super
            Admin. You can view the current {entity.labelPlural.toLowerCase()} but not edit them.
          </p>
        </div>
      </div>
    );
  }

  const [refOptions, row] = await Promise.all([
    loadRefOptions(entity, ctx.orgId, ctx.memberships, id),
    id ? getRow(entityKey, ctx.orgId, id) : Promise.resolve(null),
  ]);

  if (id && !row) notFound();

  // New record: default any real organization_id field (currently only Projects — see
  // entities.ts) to the org the user is currently in, same as every other field's `default`,
  // plus whatever the caller preset (e.g. project_id when arriving from a parent's "+ Add").
  const initialData = row
    ? (row as Record<string, unknown>)
    : entity.fields.some((f) => f.name === "organization_id") || presetValues
    ? { ...(entity.fields.some((f) => f.name === "organization_id") ? { organization_id: ctx.orgId } : null), ...presetValues }
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
          redirectTo={redirectTo ?? `/${entityKey}`}
          allowAttachments={entity.attachments}
        />
      </div>
    </div>
  );
}
