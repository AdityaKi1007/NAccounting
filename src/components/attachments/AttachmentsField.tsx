"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENT_SIZE_BYTES, MAX_ATTACHMENTS_PER_ENTITY, formatBytes } from "@/lib/attachments";

interface LiveAttachment {
  id: string;
  file_name: string;
  content_type: string;
  size_bytes: string; // bigint comes back from pg as a string
  created_at: string;
}

interface Props {
  entityType: string;
  /** The saved record's id — or null while the parent form is still creating one. In
   * "live" mode (entityId set) this component fetches/uploads/deletes against
   * /api/attachments itself. In "staged" mode (entityId null) it just displays and edits
   * the pendingFiles list the parent form owns — the parent is responsible for actually
   * uploading them (see src/lib/attachments-client.ts's uploadPendingAttachments) once it
   * has a real id to attach them to. */
  entityId: string | null;
  pendingFiles?: File[];
  onPendingFilesChange?: (files: File[]) => void;
  /** Pass "" to omit the built-in <label> entirely when the caller already renders its own
   * label alongside this field (see CustomerForm.tsx's two-column grid). */
  label?: string;
}

export default function AttachmentsField({
  entityType,
  entityId,
  pendingFiles,
  onPendingFilesChange,
  label = "Attachments",
}: Props) {
  const [live, setLive] = useState<LiveAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const staged = pendingFiles ?? [];
  const liveMode = entityId !== null;

  useEffect(() => {
    if (!entityId) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/attachments?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setLive(data.attachments ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId]);

  const count = liveMode ? live.length : staged.length;

  function validate(file: File): string | null {
    if (!(file.type in ALLOWED_ATTACHMENT_TYPES)) return `"${file.name}" isn't a supported file type (PDF, JPG, PNG, DOCX, XLSX only).`;
    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) return `"${file.name}" is larger than 10MB.`;
    return null;
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setError(null);

    if (count + files.length > MAX_ATTACHMENTS_PER_ENTITY) {
      setError(`You can upload a maximum of ${MAX_ATTACHMENTS_PER_ENTITY} files.`);
      return;
    }
    for (const f of files) {
      const err = validate(f);
      if (err) {
        setError(err);
        return;
      }
    }

    if (!liveMode) {
      onPendingFilesChange?.([...staged, ...files]);
      return;
    }

    setUploading(true);
    for (const file of files) {
      const fd = new FormData();
      fd.append("entityType", entityType);
      fd.append("entityId", entityId);
      fd.append("file", file);
      const res = await fetch("/api/attachments", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Upload failed.");
        break;
      }
      setLive((prev) => [...prev, data.attachment]);
    }
    setUploading(false);
  }

  async function removeLive(id: string) {
    if (!confirm("Remove this file? This can't be undone.")) return;
    const prev = live;
    setLive((cur) => cur.filter((a) => a.id !== id));
    const res = await fetch(`/api/attachments/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Could not remove this file.");
      setLive(prev);
    }
  }

  function removeStaged(index: number) {
    onPendingFilesChange?.(staged.filter((_, i) => i !== index));
  }

  return (
    <div>
      {label && <label className="label">{label}</label>}
      <div className="space-y-2">
        {loading && <p className="text-xs text-gray-400">Loading attachments...</p>}

        {liveMode
          ? live.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText size={15} className="shrink-0 text-gray-400" />
                  <a
                    href={`/api/attachments/${a.id}/download`}
                    className="truncate text-brand-600 hover:underline"
                    title={a.file_name}
                  >
                    {a.file_name}
                  </a>
                  <span className="shrink-0 text-xs text-gray-400">{formatBytes(Number(a.size_bytes))}</span>
                </div>
                <button type="button" onClick={() => removeLive(a.id)} className="shrink-0 text-gray-400 hover:text-red-600" title="Remove">
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          : staged.map((f, i) => (
              <div key={`${f.name}-${f.size}-${i}`} className="flex items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText size={15} className="shrink-0 text-gray-400" />
                  <span className="truncate" title={f.name}>
                    {f.name}
                  </span>
                  <span className="shrink-0 text-xs text-gray-400">{formatBytes(f.size)}</span>
                </div>
                <button type="button" onClick={() => removeStaged(i)} className="shrink-0 text-gray-400 hover:text-red-600" title="Remove">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}

        <div>
          <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="btn-secondary">
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {uploading ? "Uploading..." : "Upload File"}
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={Object.keys(ALLOWED_ATTACHMENT_TYPES).join(",")}
            onChange={onPick}
            className="hidden"
          />
          <p className="mt-1 text-xs text-gray-400">
            PDF, JPG, PNG, DOCX or XLSX — up to {MAX_ATTACHMENTS_PER_ENTITY} files, 10MB each.
          </p>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
