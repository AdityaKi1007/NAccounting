"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Copy, Mailbox, Pencil, Plus, Trash2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { formatDateTime } from "@/lib/format";

interface WebhookRow {
  id: string;
  name: string;
  token: string;
  is_active: boolean;
  trigger_count: number;
  last_triggered_at: string | null;
  default_account_id: string | null;
  default_account_name: string | null;
  default_paid_through_account_id: string | null;
  default_paid_through_name: string | null;
}

interface Option {
  id: string;
  label: string;
}

export default function IncomingWebhooksManager({
  webhooks,
  usage,
  accounts,
  bankAccounts,
}: {
  webhooks: WebhookRow[];
  usage: { used: number; limit: number };
  accounts: Option[];
  bankAccounts: Option[];
}) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WebhookRow | null>(null);
  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [paidThroughId, setPaidThroughId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const nearLimit = usage.limit > 0 && usage.used / usage.limit >= 0.8;

  function fullUrl(token: string) {
    if (typeof window === "undefined") return `/api/webhooks/incoming/${token}`;
    return `${window.location.origin}/api/webhooks/incoming/${token}`;
  }

  function openNew() {
    setEditing(null);
    setName("");
    setAccountId(accounts[0]?.id ?? "");
    setPaidThroughId("");
    setError(null);
    setCreatedUrl(null);
    setCopied(false);
    setModalOpen(true);
  }

  function openEdit(w: WebhookRow) {
    setEditing(w);
    setName(w.name);
    setAccountId(w.default_account_id ?? "");
    setPaidThroughId(w.default_paid_through_account_id ?? "");
    setError(null);
    setCreatedUrl(null);
    setModalOpen(true);
  }

  async function onToggle(w: WebhookRow) {
    await fetch(`/api/settings/webhooks/${w.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !w.is_active }),
    });
    router.refresh();
  }

  async function onDelete(id: string) {
    setDeletingId(id);
    await fetch(`/api/settings/webhooks/${id}`, { method: "DELETE" });
    setDeletingId(null);
    setConfirmId(null);
    router.refresh();
  }

  async function onSave() {
    setError(null);
    if (!name.trim()) {
      setError("Webhook name is required.");
      return;
    }
    if (!accountId) {
      setError("Choose the expense account new expenses should post to.");
      return;
    }
    setSaving(true);
    const payload = {
      name,
      default_account_id: accountId,
      default_paid_through_account_id: paidThroughId || null,
    };
    const res = editing
      ? await fetch(`/api/settings/webhooks/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/settings/webhooks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Could not save this webhook.");
      return;
    }
    if (!editing) {
      const data = await res.json();
      setCreatedUrl(fullUrl(data.webhook.token));
      router.refresh();
      return;
    }
    setModalOpen(false);
    router.refresh();
  }

  async function onCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API can be unavailable (e.g. non-HTTPS); the URL is still selectable text.
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between border-b border-gray-200 pb-4">
        <h1 className="text-lg font-semibold text-ink-800">Incoming Webhooks</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-md bg-gray-50 px-3 py-1.5 text-sm text-ink-700">
            Usage Stats (per day) :{" "}
            <span className="font-semibold">
              {usage.used} / {usage.limit}
            </span>
            {nearLimit && <AlertTriangle size={14} className="text-red-500" />}
          </div>
          <button onClick={openNew} className="btn-primary">
            <Plus size={16} /> New Incoming Webhook
          </button>
        </div>
      </div>

      {webhooks.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
            <Mailbox size={36} className="text-gray-400" />
          </div>
          <h2 className="text-base font-semibold text-ink-800">Receive Updates from External Applications</h2>
          <p className="max-w-md text-sm text-gray-500">
            A webhook lets you post messages to a specific URL when certain activities happen. You can use an
            incoming webhook to post updates from your other applications to NeoAccounting.
          </p>
          <button onClick={openNew} className="btn-primary">
            Create Incoming Webhook
          </button>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Posts To</th>
                <th className="px-4 py-2.5">Calls</th>
                <th className="px-4 py-2.5">Last Triggered</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {webhooks.map((w) => (
                <tr key={w.id}>
                  <td className="px-4 py-2.5 text-ink-800">{w.name}</td>
                  <td className="px-4 py-2.5 text-ink-700">
                    Expense &middot; {w.default_account_name ?? "-"}
                  </td>
                  <td className="px-4 py-2.5 text-ink-700">{w.trigger_count}</td>
                  <td className="px-4 py-2.5 text-ink-700">
                    {w.last_triggered_at ? formatDateTime(w.last_triggered_at) : "Never"}
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => onToggle(w)}
                      className={`relative h-5 w-9 rounded-full transition-colors ${w.is_active ? "bg-brand-600" : "bg-gray-300"}`}
                      title={w.is_active ? "On" : "Off"}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                          w.is_active ? "translate-x-4" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onCopy(fullUrl(w.token))}
                        className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-brand-600"
                        title="Copy webhook URL"
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        onClick={() => openEdit(w)}
                        className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-brand-600"
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      {confirmId === w.id ? (
                        <button
                          onClick={() => onDelete(w.id)}
                          disabled={deletingId === w.id}
                          className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                        >
                          {deletingId === w.id ? "..." : "Confirm"}
                        </button>
                      ) : (
                        <button
                          onClick={() => setConfirmId(w.id)}
                          className="rounded-md p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
                          title="Delete"
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit Incoming Webhook" : "New Incoming Webhook"}
      >
        {createdUrl ? (
          <div className="space-y-4">
            <div className="rounded-md bg-green-50 px-3 py-3 text-sm text-green-800">
              <p className="mb-2 font-medium">Webhook created. Give this URL to the external app.</p>
              <div className="flex items-center gap-2">
                <input readOnly value={createdUrl} className="input flex-1 bg-white font-mono text-xs" />
                <button
                  type="button"
                  onClick={() => onCopy(createdUrl)}
                  className="btn-secondary shrink-0"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
            <div className="rounded-md bg-gray-50 px-3 py-3 text-xs text-gray-600">
              <p className="mb-1 font-medium text-ink-700">POST a JSON body to create an expense:</p>
              <pre className="overflow-x-auto rounded bg-white p-2">{`{
  "amount": 120.50,
  "date": "2026-09-08",
  "reference_number": "PO-1042",
  "notes": "Optional description"
}`}</pre>
              <p className="mt-1">Only <code>amount</code> is required. Uses this webhook&apos;s account settings for the rest.</p>
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
                Webhook Name<span className="text-red-500"> *</span>
              </label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Payment Gateway Expenses" />
            </div>
            <div>
              <label className="label">
                Post To<span className="text-red-500"> *</span>
              </label>
              <input className="input bg-gray-50" value="Create Expense" disabled />
              <p className="mt-1 text-xs text-gray-400">This build only supports creating expenses from incoming calls.</p>
            </div>
            <div>
              <label className="label">
                Expense Account<span className="text-red-500"> *</span>
              </label>
              <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">Select an account</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Paid Through (optional)</label>
              <select className="input" value={paidThroughId} onChange={(e) => setPaidThroughId(e.target.value)}>
                <option value="">None</option>
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 border-t border-gray-100 pt-4">
              <button onClick={onSave} disabled={saving} className="btn-primary">
                {saving ? "Saving..." : editing ? "Save Changes" : "Create Webhook"}
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
