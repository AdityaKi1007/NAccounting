"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Globe } from "lucide-react";
import { CUSTOM_DOMAIN_BASE, normalizeSubdomain, subdomainValidationError } from "@/lib/custom-domain";

interface Org {
  id: string;
  custom_domain_subdomain: string | null;
  custom_domain_enabled: boolean;
}

export default function CustomDomainForm({ organization, canManage }: { organization: Org; canManage: boolean }) {
  const router = useRouter();
  const o = organization;

  const [subdomain, setSubdomain] = useState(o.custom_domain_subdomain ?? "");
  const [enabled, setEnabled] = useState(o.custom_domain_enabled);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const disabled = !canManage;
  const normalized = normalizeSubdomain(subdomain);
  const previewHost = normalized ? `${normalized}.${CUSTOM_DOMAIN_BASE}` : `yourcompany.${CUSTOM_DOMAIN_BASE}`;
  const previewUrl = `https://${previewHost}`;

  // Live format feedback as the person types — doesn't check the reserved list or uniqueness
  // against other orgs (both need a round trip, and re-validating on every keystroke would be
  // noisy); those are caught by the PATCH request itself when Save is clicked.
  const formatHint = useMemo(() => {
    if (!subdomain.trim()) return null;
    return subdomainValidationError(subdomain);
  }, [subdomain]);

  const isSavedAndLive = Boolean(o.custom_domain_subdomain) && o.custom_domain_enabled;
  const hasUnsavedChanges = normalized !== (o.custom_domain_subdomain ?? "") || enabled !== o.custom_domain_enabled;

  async function onSave() {
    setError(null);
    setMessage(null);
    if (subdomain.trim() && formatHint) {
      setError(formatHint);
      return;
    }
    setSaving(true);
    const res = await fetch("/api/settings/custom-domain", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subdomain: subdomain.trim() ? normalized : null, enabled }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Could not save the custom domain.");
      return;
    }
    setMessage("Saved.");
    router.refresh();
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(previewUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API can be unavailable (e.g. non-HTTPS); the URL is still selectable in the text.
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      {!canManage && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Only owners, admins, and Super Admin can change the custom domain. You can view the current setting below.
        </div>
      )}
      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>}

      <div className="card space-y-4 p-6">
        <div className="flex items-center gap-2">
          <Globe size={16} className="text-gray-400" />
          <h2 className="text-sm font-semibold text-ink-800">Your Subdomain</h2>
        </div>
        <p className="text-xs text-gray-500">
          Pick a subdomain of {CUSTOM_DOMAIN_BASE} for your organization. This isn&apos;t a fully custom external
          domain (bring-your-own-domain with DNS verification isn&apos;t supported yet) — it&apos;s a dedicated
          address under our own domain that&apos;s yours alone.
        </p>

        <div>
          <label className="label">Subdomain</label>
          <div className="flex items-stretch">
            <input
              className="input rounded-r-none"
              value={subdomain}
              disabled={disabled}
              placeholder="companyname"
              onChange={(e) => setSubdomain(e.target.value)}
            />
            <span className="flex items-center whitespace-nowrap rounded-r-md border border-l-0 border-gray-300 bg-gray-50 px-3 text-sm text-gray-500">
              .{CUSTOM_DOMAIN_BASE}
            </span>
          </div>
          {formatHint && subdomain.trim() && <p className="mt-1 text-xs text-red-600">{formatHint}</p>}
          {!formatHint && (
            <p className="mt-1 text-xs text-gray-400">
              Lowercase letters, numbers and hyphens only, 3-63 characters. Checked for availability when you save.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between rounded-md border border-gray-100 px-3 py-2.5">
          <div>
            <p className="text-sm font-medium text-ink-800">Enable custom domain</p>
            <p className="text-xs text-gray-500">Turn this on once you&apos;re ready to go live at your subdomain.</p>
          </div>
          <button
            type="button"
            onClick={() => setEnabled((v) => !v)}
            disabled={disabled}
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              enabled ? "bg-brand-600" : "bg-gray-300"
            }`}
            title={enabled ? "On" : "Off"}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                enabled ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        <div className="rounded-md bg-gray-50 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Preview</p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <code className="truncate text-sm text-ink-700">{previewUrl}</code>
            <button
              type="button"
              onClick={onCopy}
              className="flex shrink-0 items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
            >
              {copied ? (
                <>
                  <Check size={12} /> Copied
                </>
              ) : (
                <>
                  <Copy size={12} /> Copy
                </>
              )}
            </button>
          </div>
          {isSavedAndLive && !hasUnsavedChanges && (
            <p className="mt-1 text-xs font-medium text-green-700">Live.</p>
          )}
        </div>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <button onClick={onSave} disabled={saving || disabled} className="btn-primary">
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
