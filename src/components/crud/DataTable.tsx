"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import type { FieldDef } from "@/lib/entities";
import { formatCurrency, formatDate, titleCase } from "@/lib/format";
import type { RefOptionsMap } from "@/components/crud/EntityForm";
import ColumnCustomizer, { type ColumnOption } from "@/components/crud/ColumnCustomizer";

interface Props {
  entityKey: string;
  rows: Record<string, unknown>[];
  columns: string[];
  fields: FieldDef[];
  refOptions: RefOptionsMap;
  emptyLabel: string;
  entityKind?: "flat" | "document" | "journal" | "customer" | "payment" | "sales_order";
  /** Which column is the row's title. When set (from EntityListPage — SettingsEntityList
   * intentionally omits it), that column is always a link to the record's own page: the
   * read-only detail view when hasDetailView is set, otherwise the same edit page the row's
   * pencil action already opens. */
  titleField?: string;
  /** When set, the title column links to a read-only /[entityKey]/[id] detail page and
   * the row's edit action moves to /[entityKey]/[id]/edit instead of /[entityKey]/[id]. */
  hasDetailView?: boolean;
  /** No Edit or Delete row action at all — every write for this entity has to go through a
   * bespoke, transactional endpoint (see EntityDef.restrictedCrud). The title still links to
   * the read-only detail view when hasDetailView is set. */
  restrictedCrud?: boolean;
}

function fieldFor(fields: FieldDef[], name: string): FieldDef | undefined {
  return fields.find((f) => f.name === name);
}

function renderCell(field: FieldDef | undefined, value: unknown, refOptions: RefOptionsMap, name: string) {
  if (value === null || value === undefined || value === "") return <span className="text-gray-300">-</span>;
  // "created_at" is always a real timestamp column but never declared in any entity's own
  // fields array (it's not something a form ever edits) — the Customize Columns dialog
  // below always offers it as an optional extra column, so it needs date formatting here
  // even though `fieldFor` will never find a matching FieldDef for it.
  if (!field) return name === "created_at" ? formatDate(value) : String(value);
  if (field.type === "currency") return formatCurrency(value);
  if (field.type === "date") return formatDate(value);
  if (field.type === "boolean") return value ? <StatusPill label="Active" tone="green" /> : <StatusPill label="Inactive" tone="gray" />;
  if (field.refEntity) {
    const opt = (refOptions[name] ?? []).find((o) => o.value === String(value));
    if (!opt) return "-";
    // A resolved parent reference (e.g. a Building row's "Project" column, or a Unit row's
    // "Building"/"Project" columns) links straight to that parent record's own page — the
    // same page its own title link (below) points to — so a Project or Building name is
    // clickable everywhere it appears, not just on its own list. field.noLink opts a
    // particular refEntity field out of this (e.g. Projects' "Organization" column — there's
    // no generic /organizations/[id] detail page to link to).
    if (field.noLink) return opt.label;
    return (
      <Link href={`/${field.refEntity}/${value}`} className="text-brand-600 hover:underline">
        {opt.label}
      </Link>
    );
  }
  if (field.type === "select") {
    const opt = field.options?.find((o) => o.value === value);
    const label = opt?.label ?? titleCase(value);
    return <StatusPill label={label} tone={toneForStatus(String(value))} />;
  }
  return String(value);
}

function toneForStatus(value: string): "green" | "gray" | "amber" | "red" | "blue" {
  if (["paid", "accepted", "active", "delivered", "published", "closed", "sold", "ready"].includes(value)) return "green";
  if (["overdue", "declined", "stopped", "cancelled"].includes(value)) return "red";
  if (["draft"].includes(value)) return "gray";
  if (["partially_paid", "sent", "reserved", "offplan"].includes(value)) return "amber";
  return "blue";
}

function StatusPill({ label, tone }: { label: string; tone: "green" | "gray" | "amber" | "red" | "blue" }) {
  const toneClass = {
    green: "bg-green-50 text-green-700",
    gray: "bg-gray-100 text-gray-600",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    blue: "bg-blue-50 text-blue-700",
  }[tone];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${toneClass}`}>{label}</span>;
}

export default function DataTable({
  entityKey,
  rows,
  columns,
  fields,
  refOptions,
  emptyLabel,
  entityKind = "flat",
  titleField,
  hasDetailView = false,
  restrictedCrud = false,
}: Props) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // Every column this list could show — the caller's own default `columns` first (in their
  // given order), then any other declared field, then "created_at" as a perennial optional
  // extra (a real column on every table, but never part of any entity's own fields array
  // since no form ever edits it). This is the candidate list the Customize Columns dialog
  // offers; DataTable filters `columns`/`fields` down to whichever subset the viewer picked.
  const availableColumns: ColumnOption[] = useMemo(() => {
    const seen = new Set<string>();
    const list: ColumnOption[] = [];
    for (const col of columns) {
      if (seen.has(col)) continue;
      seen.add(col);
      list.push({ name: col, label: fieldFor(fields, col)?.label ?? titleCase(col) });
    }
    for (const f of fields) {
      if (seen.has(f.name)) continue;
      seen.add(f.name);
      list.push({ name: f.name, label: f.label });
    }
    if (!seen.has("created_at")) list.push({ name: "created_at", label: "Created On" });
    return list;
  }, [columns, fields]);

  // Per-viewer, per-entity preferences — reversible, low-stakes, and there's no per-user
  // settings table in this app to put them in, so localStorage (scoped by entityKey) is the
  // pragmatic home for them, same reasoning as any other client-only UI preference. Falls
  // back to the caller's own `columns` default whenever nothing's stored yet, or whatever
  // was stored no longer matches this entity's real columns (e.g. after an app update).
  const [visibleColumns, setVisibleColumns] = useState<string[]>(columns);
  const [clipText, setClipText] = useState(false);

  useEffect(() => {
    try {
      const storedCols = window.localStorage.getItem(`neoaz.columns.${entityKey}`);
      if (storedCols) {
        const parsed = JSON.parse(storedCols);
        const validNames = new Set(availableColumns.map((o) => o.name));
        const filtered = Array.isArray(parsed) ? parsed.filter((c) => validNames.has(c)) : [];
        setVisibleColumns(filtered.length > 0 ? filtered : columns);
      } else {
        setVisibleColumns(columns);
      }
      const storedClip = window.localStorage.getItem(`neoaz.cliptext.${entityKey}`);
      setClipText(storedClip === "true");
    } catch {
      // Private-browsing/storage-blocked: just keep the default columns, unclipped.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityKey]);

  function updateVisibleColumns(next: string[]) {
    setVisibleColumns(next);
    try {
      window.localStorage.setItem(`neoaz.columns.${entityKey}`, JSON.stringify(next));
    } catch {
      // Ignore — the choice just won't survive a reload in this browser.
    }
  }

  function updateClipText(next: boolean) {
    setClipText(next);
    try {
      window.localStorage.setItem(`neoaz.cliptext.${entityKey}`, String(next));
    } catch {
      // Ignore — same as above.
    }
  }

  const cellClass = clipText
    ? "max-w-[220px] overflow-hidden truncate whitespace-nowrap px-4 py-2.5 text-ink-800"
    : "whitespace-nowrap px-4 py-2.5 text-ink-800";

  function detailHref(id: string) {
    return `/${entityKey}/${id}`;
  }

  function editHref(id: string) {
    return hasDetailView ? `/${entityKey}/${id}/edit` : `/${entityKey}/${id}`;
  }

  function deleteUrl(id: string) {
    if (entityKind === "document") return `/api/documents/${entityKey}/${id}`;
    if (entityKind === "journal") return `/api/journals/${id}`;
    if (entityKind === "customer") return `/api/customers/${id}`;
    return `/api/entities/${entityKey}/${id}`;
  }

  async function onDelete(id: string) {
    setDeletingId(id);
    await fetch(deleteUrl(id), { method: "DELETE" });
    setDeletingId(null);
    setConfirmId(null);
    router.refresh();
  }

  const toolbar = (
    <div className="flex items-center border-b border-gray-100 px-2 py-1">
      <ColumnCustomizer
        options={availableColumns}
        visible={visibleColumns}
        onChangeVisible={updateVisibleColumns}
        clipText={clipText}
        onChangeClipText={updateClipText}
      />
    </div>
  );

  if (rows.length === 0) {
    return (
      <div>
        {toolbar}
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-sm text-gray-500">{emptyLabel}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {toolbar}
      <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {visibleColumns.map((col) => (
              <th key={col} className="px-4 py-2.5">
                {fieldFor(fields, col)?.label ?? titleCase(col)}
              </th>
            ))}
            <th className="px-4 py-2.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => {
            const id = String(row.id);
            return (
              <tr key={id} className="hover:bg-gray-50">
                {visibleColumns.map((col) => (
                  <td key={col} className={cellClass}>
                    {col === titleField ? (
                      // The row's own title is always a link to its own page — the read-only
                      // detail view when hasDetailView is set, otherwise the same edit page the
                      // row's pencil action already opens (which, for a plain flat entity like
                      // Projects/Buildings, doubles as its "detail page" since it shows every
                      // field). Either way, clicking the name always takes you to the record.
                      <Link href={hasDetailView ? detailHref(id) : editHref(id)} className="font-medium text-brand-600 hover:underline">
                        {renderCell(fieldFor(fields, col), row[col], refOptions, col)}
                      </Link>
                    ) : (
                      renderCell(fieldFor(fields, col), row[col], refOptions, col)
                    )}
                  </td>
                ))}
                <td className="px-4 py-2.5 text-right">
                  {restrictedCrud ? (
                    <Link href={detailHref(id)} className="text-xs font-medium text-brand-600 hover:underline">
                      View
                    </Link>
                  ) : (
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={editHref(id)}
                        className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-brand-600"
                        title="Edit"
                      >
                        <Pencil size={15} />
                      </Link>
                      {confirmId === id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => onDelete(id)}
                            disabled={deletingId === id}
                            className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                          >
                            {deletingId === id ? "..." : "Confirm"}
                          </button>
                          <button
                            onClick={() => setConfirmId(null)}
                            className="rounded-md px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmId(id)}
                          className="rounded-md p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
                          title="Delete"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
