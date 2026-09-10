"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Pencil, PlusCircle } from "lucide-react";
import Modal from "@/components/ui/Modal";

interface ReminderRow {
  id: string;
  doc_type: string;
  name: string;
  trigger_basis: string;
  offset_days: number;
  direction: string;
  is_active: boolean;
}

// Bills, unlike Invoices, have no manual (send-from-the-record-page) reminder templates
// in the reference product — only the automated schedule below.
const MANUAL_REMINDERS: Record<string, { name: string; description: string }[]> = {
  invoices: [
    { name: "Payment Reminder", description: "Sent manually from an invoice's page to nudge a customer for payment." },
    { name: "Thank You Note", description: "Sent manually after a payment is recorded, to thank the customer." },
  ],
  bills: [],
};

const GROUPS: { basis: string; label: string }[] = [
  { basis: "expected_payment_date", label: "Reminders Based on Expected Payment Date" },
  { basis: "due_date", label: "Reminders Based on Due Date" },
];

function scheduleLabel(r: ReminderRow, docTypeSingular: string) {
  if (r.trigger_basis === "expected_payment_date") {
    const dir = r.direction === "before" ? "Before" : "After";
    return `${r.offset_days} day(s) ${dir}`;
  }
  const dir = r.direction === "before" ? "before" : "after";
  return `Reminder will be sent ${r.offset_days} day(s) ${dir} the ${docTypeSingular} due date.`;
}

export default function RemindersManager({
  invoiceReminders,
  billReminders,
}: {
  invoiceReminders: ReminderRow[];
  billReminders: ReminderRow[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"invoices" | "bills">("invoices");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ReminderRow | null>(null);
  const [name, setName] = useState("");
  const [triggerBasis, setTriggerBasis] = useState("due_date");
  const [direction, setDirection] = useState("after");
  const [offsetDays, setOffsetDays] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = tab === "invoices" ? invoiceReminders : billReminders;
  const docTypeSingular = tab === "invoices" ? "invoice" : "bill";
  const manualReminders = MANUAL_REMINDERS[tab];

  function openNew(defaultBasis: string) {
    setEditing(null);
    setName("");
    setTriggerBasis(defaultBasis);
    setDirection(defaultBasis === "expected_payment_date" ? "before" : "after");
    setOffsetDays(1);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(r: ReminderRow) {
    setEditing(r);
    setName(r.name);
    setTriggerBasis(r.trigger_basis);
    setDirection(r.direction);
    setOffsetDays(r.offset_days);
    setError(null);
    setModalOpen(true);
  }

  async function onToggle(r: ReminderRow) {
    await fetch(`/api/settings/reminders/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !r.is_active }),
    });
    router.refresh();
  }

  async function onSave() {
    setError(null);
    if (!name.trim()) {
      setError("Reminder name is required.");
      return;
    }
    setSaving(true);
    const payload = { name, trigger_basis: triggerBasis, direction, offset_days: offsetDays };
    const res = editing
      ? await fetch(`/api/settings/reminders/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/settings/reminders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, doc_type: tab, is_active: true }),
        });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Could not save this reminder.");
      return;
    }
    setModalOpen(false);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-4 flex border-b border-gray-200">
        {(["invoices", "bills"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize ${
              tab === t ? "border-brand-600 text-brand-600" : "border-transparent text-gray-500 hover:text-ink-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {manualReminders.length > 0 && (
        <div className="card mb-6 space-y-3 p-6">
          <h2 className="text-sm font-semibold text-ink-800">Manual Reminders</h2>
          <p className="text-xs text-gray-500">
            Sent one at a time from a {docTypeSingular}&apos;s own page. Not scheduled.
          </p>
          <div className="divide-y divide-gray-100">
            {manualReminders.map((m) => (
              <div key={m.name} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-medium text-ink-800">{m.name}</p>
                  <p className="text-xs text-gray-500">{m.description}</p>
                </div>
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">Manual</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="border-b border-gray-100 px-6 py-3.5 text-sm font-semibold text-ink-800">Automated Reminders</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Schedule</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {GROUPS.map((group) => {
                const groupRows = rows.filter((r) => r.trigger_basis === group.basis);
                return (
                  <Fragment key={group.basis}>
                    <tr className="bg-gray-50">
                      <td colSpan={4} className="px-4 py-1.5 text-xs font-semibold text-gray-500">
                        {group.label}
                      </td>
                    </tr>
                    {groupRows.map((r) => (
                      <tr key={r.id}>
                        <td className="px-4 py-2.5 text-ink-800">
                          <span className="inline-flex items-center gap-1.5">
                            {r.trigger_basis === "expected_payment_date" ? (
                              <span className="text-brand-600">{r.name}</span>
                            ) : (
                              r.name
                            )}
                            {r.trigger_basis === "expected_payment_date" && (
                              <span title="Sent based on the expected payment date you set on the transaction.">
                                <Info size={13} className="text-gray-400" />
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-ink-700">{scheduleLabel(r, docTypeSingular)}</td>
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() => onToggle(r)}
                            className={`relative h-5 w-9 rounded-full transition-colors ${r.is_active ? "bg-brand-600" : "bg-gray-300"}`}
                            title={r.is_active ? "On" : "Off"}
                          >
                            <span
                              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                                r.is_active ? "translate-x-4" : "translate-x-0.5"
                              }`}
                            />
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => openEdit(r)}
                            className="rounded-md border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-100 hover:text-brand-600"
                            title="Edit"
                          >
                            <Pencil size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
              <tr>
                <td colSpan={4} className="px-4 py-2.5">
                  <button
                    onClick={() => openNew("due_date")}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline"
                  >
                    <PlusCircle size={16} /> New Reminder
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Reminder" : "New Reminder"}>
        <div className="space-y-4">
          {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div>
            <label className="label">
              Name<span className="text-red-500"> *</span>
            </label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Days</label>
              <input
                type="number"
                min={0}
                className="input"
                value={offsetDays}
                onChange={(e) => setOffsetDays(Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
              />
            </div>
            <div>
              <label className="label">Direction</label>
              <select className="input" value={direction} onChange={(e) => setDirection(e.target.value)}>
                <option value="before">Before</option>
                <option value="after">After</option>
              </select>
            </div>
            <div>
              <label className="label">Basis</label>
              <select className="input" value={triggerBasis} onChange={(e) => setTriggerBasis(e.target.value)}>
                <option value="due_date">Due Date</option>
                <option value="expected_payment_date">Expected Payment Date</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2 border-t border-gray-100 pt-4">
            <button onClick={onSave} disabled={saving} className="btn-primary">
              {saving ? "Saving..." : "Save"}
            </button>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
