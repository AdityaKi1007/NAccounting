"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FieldDef } from "@/lib/entities";
import AttachmentsField from "@/components/attachments/AttachmentsField";
import { uploadPendingAttachments } from "@/lib/attachments-client";

export type RefOptionsMap = Record<string, { value: string; label: string; group?: string }[]>;

interface Props {
  entityKey: string;
  fields: FieldDef[];
  refOptions: RefOptionsMap;
  initialData?: Record<string, unknown> | null;
  recordId?: string;
  redirectTo: string;
  onSuccess?: (row: Record<string, unknown>) => void;
  submitLabel?: string;
  columns?: 1 | 2;
  /** Renders AttachmentsField below the fields — see entities.ts's EntityDef.attachments. */
  allowAttachments?: boolean;
}

function initialValue(field: FieldDef, initialData?: Record<string, unknown> | null) {
  if (initialData && field.name in initialData && initialData[field.name] !== null) {
    const v = initialData[field.name];
    if (field.type === "date" && v) return String(v).slice(0, 10);
    return v;
  }
  if (field.default !== undefined) return field.default;
  if (field.type === "boolean") return false;
  return "";
}

export default function EntityForm({
  entityKey,
  fields,
  refOptions,
  initialData,
  recordId,
  redirectTo,
  onSuccess,
  submitLabel,
  columns = 2,
  allowAttachments,
}: Props) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const v: Record<string, unknown> = {};
    for (const f of fields) v[f.name] = initialValue(f, initialData);
    return v;
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Only used while creating (recordId is unset) — see AttachmentsField's "staged" mode.
  // Once editing an existing record, AttachmentsField manages its own list directly against
  // entityId=recordId, so this never gets populated then.
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  function setField(name: string, value: unknown) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    for (const f of fields) {
      if (f.required && (values[f.name] === "" || values[f.name] === undefined || values[f.name] === null)) {
        setError(`${f.label} is required`);
        return;
      }
    }
    setSaving(true);
    const url = recordId ? `/api/entities/${entityKey}/${recordId}` : `/api/entities/${entityKey}`;
    const method = recordId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      setSaving(false);
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Something went wrong.");
      return;
    }
    const data = await res.json();
    if (!recordId && pendingFiles.length > 0) {
      const newId = data.row?.id as string | undefined;
      if (newId) {
        const errors = await uploadPendingAttachments(entityKey, newId, pendingFiles);
        // The record itself is already saved at this point — an attachment failure
        // shouldn't block navigating away, but it also shouldn't pass silently, so it's
        // surfaced with a blocking alert() (same pattern this app already uses for delete
        // confirmations) rather than the inline error banner, which would be replaced by
        // the redirect before anyone could read it.
        if (errors.length > 0) alert(`Saved, but some files didn't upload:\n${errors.join("\n")}`);
      }
    }
    setSaving(false);
    if (onSuccess) {
      onSuccess(data.row);
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className={columns === 2 ? "grid grid-cols-1 gap-4 sm:grid-cols-2" : "space-y-4"}>
        {fields.map((field) => (
          <FieldInput
            key={field.name}
            field={field}
            value={values[field.name]}
            onChange={(v) => setField(field.name, v)}
            options={field.refEntity ? refOptions[field.name] ?? [] : field.options}
            wide={field.type === "textarea"}
          />
        ))}
      </div>
      {allowAttachments && (
        <AttachmentsField
          entityType={entityKey}
          entityId={recordId ?? null}
          pendingFiles={pendingFiles}
          onPendingFilesChange={setPendingFiles}
        />
      )}
      <div className="flex items-center gap-2 border-t border-gray-100 pt-4">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? "Saving..." : submitLabel ?? (recordId ? "Save Changes" : "Save")}
        </button>
        <button type="button" onClick={() => router.push(redirectTo)} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}

type SelectOpt = { value: string; label: string; group?: string };

function FieldInput({
  field,
  value,
  onChange,
  options,
  wide,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  options?: SelectOpt[];
  wide?: boolean;
}) {
  // Consecutive options sharing a `group` render as one <optgroup>, matching how Zoho
  // groups its Account Type list (Asset / Liability / Equity / Income / Expense); options
  // without a group (every other select in the app) render as plain <option>s, unchanged.
  const grouped: { group: string | null; items: SelectOpt[] }[] = [];
  for (const opt of options ?? []) {
    const last = grouped[grouped.length - 1];
    if (last && last.group === (opt.group ?? null)) {
      last.items.push(opt);
    } else {
      grouped.push({ group: opt.group ?? null, items: [opt] });
    }
  }
  const wrapClass = wide ? "sm:col-span-2" : "";

  if (field.type === "boolean") {
    return (
      <div className={`flex items-center gap-2 pt-6 ${wrapClass}`}>
        <input
          id={field.name}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
        />
        <label htmlFor={field.name} className="text-sm text-ink-800">
          {field.label}
        </label>
      </div>
    );
  }

  return (
    <div className={wrapClass}>
      <label className="label">
        {field.label}
        {field.required && <span className="text-red-500"> *</span>}
      </label>
      {field.type === "textarea" ? (
        <textarea
          className="input"
          rows={3}
          value={(value as string) ?? ""}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : field.type === "select" ? (
        <select
          className="input"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Select {field.label}</option>
          {grouped.map((g) =>
            g.group ? (
              <optgroup key={g.group} label={g.group}>
                {g.items.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </optgroup>
            ) : (
              g.items.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))
            )
          )}
        </select>
      ) : (
        <input
          className="input"
          type={
            field.type === "date"
              ? "date"
              : field.type === "number" || field.type === "currency"
              ? "number"
              : field.type === "email"
              ? "email"
              : "text"
          }
          step={field.type === "currency" || field.type === "number" ? "0.01" : undefined}
          value={(value as string | number) ?? ""}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {field.helpText && <p className="mt-1 text-xs text-gray-400">{field.helpText}</p>}
    </div>
  );
}
