"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Code2, Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { formatDateTime } from "@/lib/format";

interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  last_used_at: string | null;
  request_count: number;
  created_at: string;
}

const ENDPOINTS: { method: string; path: string; note: string }[] = [
  { method: "GET", path: "/api/v1/invoices", note: "List invoices (add ?id=... for one)" },
  { method: "POST", path: "/api/v1/invoices", note: "Create an invoice" },
  { method: "PATCH", path: "/api/v1/invoices/{id}", note: "Update an invoice" },
  { method: "GET", path: "/api/v1/receipts", note: "List payment receipts" },
  { method: "POST", path: "/api/v1/receipts", note: "Record a payment / receipt" },
  { method: "PATCH", path: "/api/v1/receipts/{id}", note: "Update a receipt" },
  { method: "GET", path: "/api/v1/customers", note: "List customers" },
  { method: "POST", path: "/api/v1/customers", note: "Create a customer" },
  { method: "PATCH", path: "/api/v1/customers/{id}", note: "Update a customer" },
  { method: "GET", path: "/api/v1/sales-orders", note: "List sales orders" },
  { method: "POST", path: "/api/v1/sales-orders", note: "Create a sales order" },
  { method: "PATCH", path: "/api/v1/sales-orders/{id}", note: "Update a sales order" },
];

const methodColor: Record<string, string> = {
  GET: "bg-blue-100 text-blue-700",
  POST: "bg-emerald-100 text-emerald-700",
  PATCH: "bg-amber-100 text-amber-700",
};

export default function ApiKeysManager({ keys }: { keys: ApiKeyRow[] }) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  function openNew() {
    setName("");
    setError(null);
    setCreatedKey(null);
    setCopied(false);
    setModalOpen(true);
  }

  async function onToggle(k: ApiKeyRow) {
    await fetch(`/api/settings/api-keys/${k.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !k.is_active }),
    });
    router.refresh();
  }

  async function onDelete(id: string) {
    setDeletingId(id);
    await fetch(`/api/settings/api-keys/${id}`, { method: "DELETE" });
    setDeletingId(null);
    setConfirmId(null);
    router.refresh();
  }

  async function onSave() {
    setError(null);
    if (!name.trim()) {
      setError("Key name is required.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/settings/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Could not create this API key.");
      return;
    }
    const data = await res.json();
    setCreatedKey(data.rawKey);
    router.refresh();
  }

  async function onCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API can be unavailable (e.g. non-HTTPS); the text is still selectable.
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-lg font-semibold text-ink-800">API Keys</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Let external systems send invoices, receipts, customers and sales orders into NeoAccountingZ over REST.
          </p>
        </div>
        <button onClick={openNew} className="btn-primary">
          <Plus size={16} /> Generate API Key
        </button>
      </div>

      {keys.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
            <KeyRound size={36} className="text-gray-400" />
          </div>
          <h2 className="text-base font-semibold text-ink-800">Connect a Third-Party System</h2>
          <p className="max-w-md text-sm text-gray-500">
            Generate a key and pass it as a bearer token to read and write invoices, receipts, customers and sales
            orders from another application.
          </p>
          <button onClick={openNew} className="btn-primary">
            Generate API Key
          </button>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Key</th>
                <th className="px-4 py-2.5">Requests</th>
                <th className="px-4 py-2.5">Last Used</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {keys.map((k) => (
                <tr key={k.id}>
                  <td className="px-4 py-2.5 text-ink-800">{k.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-ink-700">{k.key_prefix}••••••••</td>
                  <td className="px-4 py-2.5 text-ink-700">{k.request_count}</td>
                  <td className="px-4 py-2.5 text-ink-700">{k.last_used_at ? formatDateTime(k.last_used_at) : "Never"}</td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => onToggle(k)}
                      className={`relative h-5 w-9 rounded-full transition-colors ${k.is_active ? "bg-brand-600" : "bg-gray-300"}`}
                      title={k.is_active ? "On" : "Off"}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                          k.is_active ? "translate-x-4" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {confirmId === k.id ? (
                        <button
                          onClick={() => onDelete(k.id)}
                          disabled={deletingId === k.id}
                          className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                        >
                          {deletingId === k.id ? "..." : "Confirm"}
                        </button>
                      ) : (
                        <button
                          onClick={() => setConfirmId(k.id)}
                          className="rounded-md p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
                          title="Revoke"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
        <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink-800">
          <Code2 size={14} className="text-gray-400" /> REST API Reference
        </p>
        <p className="mb-3 text-xs text-gray-500">
          Authenticate every request with{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5">Authorization: Bearer &lt;your key&gt;</code> (or an{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5">X-API-Key</code> header).
        </p>
        <div className="space-y-1.5">
          {ENDPOINTS.map((e) => (
            <div key={`${e.method} ${e.path}`} className="flex items-center gap-3 text-xs">
              <span className={`w-14 shrink-0 rounded px-1.5 py-0.5 text-center font-mono font-semibold ${methodColor[e.method]}`}>
                {e.method}
              </span>
              <code className="w-56 shrink-0 text-ink-700">{e.path}</code>
              <span className="text-gray-500">{e.note}</span>
            </div>
          ))}
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Generate API Key">
        {createdKey ? (
          <div className="space-y-4">
            <div className="rounded-md bg-amber-50 px-3 py-3 text-sm text-amber-800">
              <p className="mb-2 flex items-center gap-1.5 font-medium">
                <AlertTriangle size={14} /> Copy this key now — you won&apos;t be able to see it again.
              </p>
              <div className="flex items-center gap-2">
                <input readOnly value={createdKey} className="input flex-1 bg-white font-mono text-xs" />
                <button type="button" onClick={() => onCopy(createdKey)} className="btn-secondary shrink-0">
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <div>
              <label className="label">
                Key Name<span className="text-red-500"> *</span>
              </label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Order Management System"
              />
            </div>
            <div className="flex items-center gap-2 border-t border-gray-100 pt-4">
              <button onClick={onSave} disabled={saving} className="btn-primary">
                {saving ? "Generating..." : "Generate Key"}
              </button>
              <button className="btn-secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
