"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Initial {
  s3_access_key_id: string;
  s3_region: string;
  s3_bucket_name: string;
  s3_endpoint: string;
  s3_force_path_style: boolean;
  secret_key_set: boolean;
}

export default function S3StorageSettingsForm({
  initial,
  canManage,
}: {
  initial: Initial;
  canManage: boolean;
}) {
  const router = useRouter();

  const [accessKeyId, setAccessKeyId] = useState(initial.s3_access_key_id);
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [secretKeySet, setSecretKeySet] = useState(initial.secret_key_set);
  const [region, setRegion] = useState(initial.s3_region);
  const [bucketName, setBucketName] = useState(initial.s3_bucket_name);
  const [endpoint, setEndpoint] = useState(initial.s3_endpoint);
  const [forcePathStyle, setForcePathStyle] = useState(initial.s3_force_path_style);
  const [showAdvanced, setShowAdvanced] = useState(Boolean(initial.s3_endpoint || initial.s3_force_path_style));

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const disabled = !canManage;

  function currentValues() {
    return {
      s3_access_key_id: accessKeyId,
      s3_region: region,
      s3_bucket_name: bucketName,
      s3_endpoint: endpoint,
      s3_force_path_style: forcePathStyle,
      s3_secret_access_key: secretAccessKey || undefined,
    };
  }

  async function onSave() {
    setError(null);
    setMessage(null);
    if (!accessKeyId.trim()) return setError("Access Key ID is required.");
    if (!region.trim()) return setError("Region is required.");
    if (!bucketName.trim()) return setError("Bucket Name is required.");
    if (!secretAccessKey && !secretKeySet) return setError("Secret Access Key is required.");

    setSaving(true);
    const res = await fetch("/api/settings/file-storage", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(currentValues()),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Could not save changes.");
      return;
    }
    if (secretAccessKey) setSecretKeySet(true);
    setSecretAccessKey("");
    setMessage("Saved.");
    router.refresh();
  }

  async function onTest() {
    setError(null);
    setMessage(null);
    setTesting(true);
    const res = await fetch("/api/settings/file-storage/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(currentValues()),
    });
    setTesting(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Connection test failed.");
      return;
    }
    setMessage("Connected successfully — this bucket is reachable with these credentials.");
  }

  async function onDelete() {
    if (!window.confirm("Remove these S3 settings? File uploads will fall back to the app's default storage, if any is configured, or stop working until this is set up again.")) {
      return;
    }
    setError(null);
    setMessage(null);
    setDeleting(true);
    const res = await fetch("/api/settings/file-storage", { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Could not remove these settings.");
      return;
    }
    setAccessKeyId("");
    setSecretAccessKey("");
    setSecretKeySet(false);
    setRegion("");
    setBucketName("");
    setEndpoint("");
    setForcePathStyle(false);
    setMessage("Removed.");
    router.refresh();
  }

  return (
    <div className="max-w-2xl space-y-6">
      {!canManage && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Only owners and admins can change file storage settings. You can view the current settings below.
        </div>
      )}
      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>}

      <div className="card space-y-4 p-6">
        <p className="text-sm text-gray-500">
          Connect the S3 bucket file attachments (Sales Orders, Purchase Orders, Payments Received,
          Customers, Vendors, and every other module that accepts an upload) should be stored in.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Access Key ID *</label>
            <input
              className="input"
              value={accessKeyId}
              disabled={disabled}
              onChange={(e) => setAccessKeyId(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Secret Access Key {!secretKeySet ? "*" : ""}</label>
            <input
              type="password"
              className="input"
              value={secretAccessKey}
              disabled={disabled}
              placeholder={secretKeySet ? "Saved — leave blank to keep it" : ""}
              onChange={(e) => setSecretAccessKey(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Region *</label>
            <input
              className="input"
              value={region}
              disabled={disabled}
              placeholder="me-central-1"
              onChange={(e) => setRegion(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Bucket Name *</label>
            <input
              className="input"
              value={bucketName}
              disabled={disabled}
              onChange={(e) => setBucketName(e.target.value)}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-sm text-brand-600 hover:underline"
        >
          {showAdvanced ? "Hide advanced options" : "Show advanced options"}
        </button>
        {showAdvanced && (
          <div className="grid grid-cols-1 gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2">
            <div>
              <label className="label">Custom Endpoint</label>
              <input
                className="input"
                value={endpoint}
                disabled={disabled}
                placeholder="Leave blank for real AWS S3"
                onChange={(e) => setEndpoint(e.target.value)}
              />
              <p className="mt-1 text-xs text-gray-400">
                Only needed for an S3-compatible provider (MinIO, Cloudflare R2, etc.), not real AWS.
              </p>
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm text-ink-700">
                <input
                  type="checkbox"
                  checked={forcePathStyle}
                  disabled={disabled}
                  onChange={(e) => setForcePathStyle(e.target.checked)}
                />
                Force path-style addressing
              </label>
            </div>
          </div>
        )}
      </div>

      <div className="card space-y-3 p-6">
        <h2 className="text-sm font-semibold text-ink-800">Test Connection</h2>
        <p className="text-xs text-gray-400">
          Checks whether this bucket is reachable with the details above — you don&apos;t need to save first.
        </p>
        <button onClick={onTest} disabled={testing || disabled} className="btn-secondary">
          {testing ? "Testing..." : "Test Connection"}
        </button>
      </div>

      <div className="flex items-center justify-between border-t border-gray-100 pt-4">
        <button onClick={onSave} disabled={saving || disabled} className="btn-primary">
          {saving ? "Saving..." : "Save"}
        </button>
        {(initial.secret_key_set || secretKeySet) && (
          <button
            onClick={onDelete}
            disabled={deleting || disabled}
            className="text-sm text-red-600 hover:underline disabled:opacity-50"
          >
            {deleting ? "Removing..." : "Remove these settings"}
          </button>
        )}
      </div>
    </div>
  );
}
