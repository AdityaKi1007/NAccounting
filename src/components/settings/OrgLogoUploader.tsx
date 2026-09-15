"use client";

import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { ALLOWED_LOGO_TYPES, MAX_LOGO_SIZE_BYTES } from "@/lib/org-logo";

/** Replaces the old permanently-disabled "Upload Logo" placeholder on the Company Profile
 * settings page. Uploads/removes immediately against /api/organizations/logo (no separate
 * "Save" step, matching AttachmentsField's own live-mode convention) rather than being
 * folded into CompanyProfileForm's own onSave — a logo is a single file, not one of the
 * plain text/select fields that form's Save button already batches together. */
export default function OrgLogoUploader({
  initialLogoDataUri,
  canManage,
}: {
  initialLogoDataUri: string | null;
  canManage: boolean;
}) {
  const [logoDataUri, setLogoDataUri] = useState(initialLogoDataUri);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function validate(file: File): string | null {
    if (!(file.type in ALLOWED_LOGO_TYPES)) return "Unsupported file type. Allowed: jpg, jpeg, png, gif, bmp.";
    if (file.size > MAX_LOGO_SIZE_BYTES) return "Logo must be 1MB or smaller.";
    return null;
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);

    const validationError = validate(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/organizations/logo", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    setUploading(false);
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Could not upload this logo.");
      return;
    }
    setLogoDataUri(data.logoDataUri ?? null);
  }

  async function onRemove() {
    if (!confirm("Remove the organization logo?")) return;
    setError(null);
    const prev = logoDataUri;
    setLogoDataUri(null);
    const res = await fetch("/api/organizations/logo", { method: "DELETE" });
    if (!res.ok) {
      setError("Could not remove the logo.");
      setLogoDataUri(prev);
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading || !canManage}
        className="flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-md border border-dashed border-gray-300 text-center text-xs text-gray-500 hover:border-brand-400 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
        title={logoDataUri ? "Change logo" : "Upload Logo"}
      >
        {uploading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : logoDataUri ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoDataUri} alt="Organization logo" className="h-full w-full object-contain p-1" />
        ) : (
          <>
            <Upload size={16} />
            Upload Logo
          </>
        )}
      </button>
      <input ref={inputRef} type="file" accept={Object.keys(ALLOWED_LOGO_TYPES).join(",")} onChange={onPick} className="hidden" />
      <div className="text-xs text-gray-500">
        <p>This logo will be displayed in transaction PDFs and email notifications.</p>
        <p className="mt-1">Preferred Image Dimensions: 240 x 240 pixels @ 72 DPI</p>
        <p>Supported Files: jpg, jpeg, png, gif, bmp &middot; Max 1MB</p>
        {logoDataUri && canManage && (
          <button type="button" onClick={onRemove} className="mt-1 text-red-600 hover:underline">
            Remove Logo
          </button>
        )}
        {error && <p className="mt-1 text-red-600">{error}</p>}
      </div>
    </div>
  );
}
