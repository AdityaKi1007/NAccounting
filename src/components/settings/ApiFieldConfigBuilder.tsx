"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Layers, Loader2 } from "lucide-react";

// "Request Payload Builder" — lets an org add/remove which OPTIONAL fields their own
// /api/v1/* integration is allowed to send on create/update, per entity. This is the same
// configuration the real /api/v1/* routes enforce (see src/lib/api-field-config.ts and the
// comment atop each route's POST/PATCH handler) — toggling a field off here is not just a
// docs preview, it's saved per organization and takes effect on the next real API call.

interface FieldSpec {
  name: string;
  label: string;
  core?: boolean;
  sample: string | number | boolean | null;
  autoAssignedIfDisabled?: boolean;
}

type Catalog = Record<string, Partial<Record<"create" | "update", FieldSpec[]>>>;

const ENTITY_ORDER = ["invoices", "sales-orders", "receipts", "customers", "vendors", "credit-notes", "units"];

// Structural, always-present pieces of each entity's request/response shape that are NOT part
// of the configurable field catalog (line items, computed totals, system columns) — kept here
// purely to make the live preview panel look like a real request/response, matching
// claude/api-reference-v1.md. None of this is enforced or saved; it's cosmetic context around
// the fields that actually are configurable.
const SAMPLE_LINES = [{ description: "Consulting", quantity: 1, rate: 1000 }];
const SAMPLE_CN_LINES = [{ description: "Damaged widget refund", quantity: 1, rate: 300 }];
const SAMPLE_ORG_ID = "bb52a4a8-54b2-4ccf-947a-4a2555136760";

function fieldValue(f: FieldSpec, enabled: boolean, forResponse: boolean): { include: boolean; value: unknown } {
  if (f.core || enabled) return { include: true, value: f.sample };
  if (forResponse && f.autoAssignedIfDisabled) return { include: true, value: f.sample };
  if (forResponse) return { include: true, value: null };
  return { include: false, value: undefined };
}

function buildFieldsObject(specs: FieldSpec[], disabledSet: Set<string>, forResponse: boolean) {
  const out: Record<string, unknown> = {};
  for (const f of specs) {
    const enabled = f.core || !disabledSet.has(f.name);
    const { include, value } = fieldValue(f, enabled, forResponse);
    if (include) out[f.name] = value;
  }
  return out;
}

function buildPreview(entity: string, operation: "create" | "update", specs: FieldSpec[], disabledSet: Set<string>) {
  const reqFields = buildFieldsObject(specs, disabledSet, false);
  const resFields = buildFieldsObject(specs, disabledSet, true);

  if (entity === "invoices" || entity === "sales-orders") {
    const numberKey = entity === "invoices" ? "invoice_number" : "so_number";
    const request = { header: reqFields, lines: SAMPLE_LINES, taxPercent: 0 };
    const response = {
      data: {
        header: {
          id: "9d8e22b8-f29e-45c0-9d9f-cb171e730cf2",
          organization_id: SAMPLE_ORG_ID,
          ...resFields,
          [numberKey]: resFields[numberKey] ?? "AUTO-GENERATED",
          subtotal: "1000",
          tax_total: "0",
          total: "1000",
          ...(entity === "invoices" ? { balance_due: "1000" } : {}),
        },
        lines: [{ id: "4215840e-36df-4668-91dd-be7f937e22a6", ...SAMPLE_LINES[0], amount: "1000" }],
        taxPercent: 0,
      },
    };
    return { request, response: operation === "create" ? response : { data: response.data } };
  }

  if (entity === "receipts") {
    if (operation === "create") {
      const request = reqFields;
      const response = {
        data: {
          header: {
            id: "b85df141-9739-45bc-8b64-099704255520",
            organization_id: SAMPLE_ORG_ID,
            ...resFields,
            payment_number: resFields.payment_number ?? "AUTO-GENERATED",
          },
          allocations: [],
        },
      };
      return { request, response };
    }
    const request = reqFields;
    const response = {
      data: {
        header: {
          id: "b85df141-9739-45bc-8b64-099704255520",
          organization_id: SAMPLE_ORG_ID,
          customer_id: "05dfee68-f504-4694-83b0-471c251676ab",
          amount: "1500",
          bank_account_id: "08c46dd9-221c-4fe9-88e0-5086fcd420e5",
          status: "paid",
          ...resFields,
        },
        allocations: [],
      },
    };
    return { request, response };
  }

  if (entity === "customers" || entity === "vendors" || entity === "units") {
    const request = reqFields;
    const response = {
      data: {
        id:
          entity === "customers"
            ? "05dfee68-f504-4694-83b0-471c251676ab"
            : entity === "vendors"
            ? "9e499ef0-bd64-4454-8649-b7d79f8fdbd7"
            : "7c1f9e2a-3d5b-4c8e-9a1f-2b6d8e4c0a7f",
        organization_id: SAMPLE_ORG_ID,
        ...resFields,
        created_at: "2026-09-12T18:32:16.099Z",
      },
    };
    return { request, response };
  }

  // credit-notes (create only)
  const request = { ...reqFields, lines: SAMPLE_CN_LINES };
  const response = {
    data: {
      id: "225a4bbc-5e4c-44aa-835b-989e3d98eb9d",
      organization_id: SAMPLE_ORG_ID,
      number: "CN-000001",
      customer_id: "05dfee68-f504-4694-83b0-471c251676ab",
      ...resFields,
      status: "open",
      subtotal: "300",
      tax_total: "0",
      total: "300",
      balance_applied: "300",
      created_at: "2026-09-10T18:33:27.680Z",
      line_items: [{ id: "855ba2bd-e174-4bb8-8df6-77d6052dfb1c", ...SAMPLE_CN_LINES[0], amount: "300" }],
    },
  };
  return { request, response };
}

export default function ApiFieldConfigBuilder({ canManage = true }: { canManage?: boolean }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [disabled, setDisabled] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [entity, setEntity] = useState("invoices");
  const [operation, setOperation] = useState<"create" | "update">("create");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/api-field-config")
      .then((r) => r.json())
      .then((data) => {
        setCatalog(data.catalog);
        setLabels(data.labels ?? {});
        setDisabled(data.disabled ?? {});
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const specs = catalog?.[entity]?.[operation] ?? null;
  const key = `${entity}:${operation}`;
  const disabledSet = useMemo(() => new Set(disabled[key] ?? []), [disabled, key]);

  function toggleField(name: string) {
    if (!canManage) return;
    setSaved(false);
    setDisabled((prev) => {
      const current = new Set(prev[key] ?? []);
      if (current.has(name)) current.delete(name);
      else current.add(name);
      return { ...prev, [key]: Array.from(current) };
    });
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/settings/api-field-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity, operation, disabledFields: Array.from(disabledSet) }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Could not save this configuration.");
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) {
    return (
      <div className="mt-6 flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
        <Loader2 size={14} className="animate-spin" /> Loading request payload configuration...
      </div>
    );
  }

  if (!catalog) return null;

  const preview = specs ? buildPreview(entity, operation, specs, disabledSet) : null;

  return (
    <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
      <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-ink-800">
        <Layers size={14} className="text-gray-400" /> Request Payload Builder
      </p>
      <p className="mb-3 text-xs text-gray-500">
        Choose which optional fields your integration is allowed to send when creating or updating each entity over
        the API. Fields marked <span className="font-medium text-ink-700">Required</span> can&apos;t be turned off.
        A field you turn off is silently ignored by the real API if a caller still sends it — this is saved per
        organization and takes effect immediately.
      </p>

      {!canManage && (
        <div className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Only owners, admins, and Super Admin can change the request payload configuration. You can view it below.
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-1.5 border-b border-gray-100 pb-3">
        {ENTITY_ORDER.filter((e) => catalog[e]).map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => {
              setEntity(e);
              setOperation(catalog[e]?.create ? "create" : "update");
            }}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
              entity === e ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {labels[e] ?? e}
          </button>
        ))}
      </div>

      <div className="mb-4 flex gap-1.5">
        {(["create", "update"] as const)
          .filter((op) => catalog[entity]?.[op])
          .map((op) => (
            <button
              key={op}
              type="button"
              onClick={() => setOperation(op)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize ${
                operation === op ? "bg-ink-800 text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"
              }`}
            >
              {op === "create" ? "POST (create)" : "PATCH (update)"}
            </button>
          ))}
      </div>

      {specs && preview && (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Fields</p>
            <div className="space-y-1">
              {specs.map((f) => {
                const isOn = f.core || !disabledSet.has(f.name);
                return (
                  <label
                    key={f.name}
                    className={`flex items-center justify-between rounded-md border border-gray-100 px-2.5 py-1.5 text-xs ${
                      f.core ? "bg-gray-50" : "cursor-pointer hover:bg-gray-50"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isOn}
                        disabled={f.core || !canManage}
                        onChange={() => toggleField(f.name)}
                        className="h-3.5 w-3.5 rounded border-gray-300"
                      />
                      <span className="text-ink-700">{f.label}</span>
                      <code className="text-[10px] text-gray-400">{f.name}</code>
                    </span>
                    {f.core && <span className="text-[10px] font-medium text-amber-600">Required</span>}
                  </label>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button onClick={onSave} disabled={saving || !canManage} className="btn-primary">
                {saving ? "Saving..." : "Save Configuration"}
              </button>
              {saved && (
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                  <Check size={13} /> Saved
                </span>
              )}
            </div>
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          </div>

          <div className="space-y-3">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Sample Request Body
              </p>
              <pre className="overflow-x-auto rounded bg-ink-900 p-2.5 text-[11px] leading-relaxed text-gray-100">
                <code>{JSON.stringify(preview.request, null, 2)}</code>
              </pre>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Sample Response Body
              </p>
              <pre className="overflow-x-auto rounded bg-ink-900 p-2.5 text-[11px] leading-relaxed text-gray-100">
                <code>{JSON.stringify(preview.response, null, 2)}</code>
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
