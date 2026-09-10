"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ChevronLeft, Copy, Plus, Building2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { formatDate, orgDisplayId } from "@/lib/format";
import { COUNTRIES } from "@/lib/countries";

interface OrgSummary {
  id: string;
  name: string;
  orgSeq: string;
  locationCountry: string;
  createdAt: string;
  role: string;
  isDefault: boolean;
}

function roleSentence(role: string) {
  const article = /^[aeiou]/i.test(role) ? "an" : "a";
  return `You are ${article} ${role} in this organization`;
}

export default function OrganizationsManager({
  greetingName,
  activeOrgId,
  organizations,
}: {
  greetingName: string;
  activeOrgId: string;
  organizations: OrgSummary[];
}) {
  const router = useRouter();
  const { update } = useSession();

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function goToOrganization(orgId: string) {
    if (orgId === activeOrgId) {
      router.push("/");
      return;
    }
    setSwitchingId(orgId);
    await update({ activeOrgId: orgId });
    setSwitchingId(null);
    router.push("/");
    router.refresh();
  }

  async function copyId(orgId: string, displayId: string) {
    try {
      await navigator.clipboard.writeText(displayId);
      setCopiedId(orgId);
      setTimeout(() => setCopiedId((v) => (v === orgId ? null : v)), 1500);
    } catch {
      // Clipboard access can be blocked by the browser; the ID is still visible to copy by hand.
    }
  }

  async function createOrganization() {
    setError(null);
    if (!newName.trim()) {
      setError("Organization Name is required.");
      return;
    }
    if (!newLocation) {
      setError("Organization Location is required.");
      return;
    }
    setCreating(true);
    const res = await fetch("/api/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationName: newName.trim(), locationCountry: newLocation }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setCreating(false);
      setError(typeof data.error === "string" ? data.error : "Could not create organization.");
      return;
    }
    const data = await res.json();
    await update({ refreshMemberships: true, activeOrgId: data.id });
    setCreating(false);
    setCreateOpen(false);
    setNewName("");
    setNewLocation("");
    router.push("/");
    router.refresh();
  }

  function closeCreateModal() {
    setCreateOpen(false);
    setError(null);
    setNewName("");
    setNewLocation("");
  }

  return (
    <div className="p-6">
      <button
        type="button"
        onClick={() => router.back()}
        className="mb-6 inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1 text-sm text-gray-600 hover:bg-gray-50"
      >
        <ChevronLeft size={14} />
        Back
      </button>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink-800">Hi, {greetingName}!</h1>
          <p className="mt-1 max-w-xl text-sm text-gray-500">
            You are a part of the following organizations. Go to the organization which you wish to access now.
          </p>
        </div>
        <button type="button" onClick={() => setCreateOpen(true)} className="btn-primary shrink-0">
          <Plus size={15} />
          New Organization
        </button>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-ink-800">My Organizations</h2>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
          {organizations.length}
        </span>
      </div>

      <div className="space-y-3">
        {organizations.map((org) => {
          const displayId = orgDisplayId(org.orgSeq);
          const isActive = org.id === activeOrgId;
          return (
            <div key={org.id} className="relative overflow-hidden rounded-lg border border-gray-200 bg-white p-4">
              {org.isDefault && (
                <span className="absolute left-0 top-0 -translate-x-[30%] -translate-y-[10%] -rotate-45 bg-emerald-500 px-6 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                  Default
                </span>
              )}
              <div className="flex items-center gap-4 pl-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-300">
                  <Building2 size={24} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-base font-medium text-ink-800">{org.name}</p>
                    <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-600">
                      Premium Trial
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs italic text-gray-400">Organization created on {formatDate(org.createdAt)}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                    Organization ID: {displayId}
                    <button
                      type="button"
                      onClick={() => copyId(org.id, displayId)}
                      className="text-gray-400 hover:text-brand-600"
                      title="Copy Organization ID"
                    >
                      <Copy size={12} />
                    </button>
                    {copiedId === org.id && <span className="text-emerald-600">Copied</span>}
                  </p>
                  <p className="text-xs text-gray-500">Edition: {org.locationCountry}</p>
                  <p className="mt-1 text-xs text-gray-500">{roleSentence(org.role)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => goToOrganization(org.id)}
                  disabled={switchingId === org.id}
                  className={isActive ? "btn-secondary shrink-0" : "btn-primary shrink-0"}
                >
                  {switchingId === org.id ? "Switching..." : isActive ? "Current Organization" : "Go to Organization"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={createOpen} onClose={closeCreateModal} hideHeader width="max-w-lg">
        <div className="space-y-5 pr-6">
          <div>
            <h2 className="text-xl font-semibold text-ink-800">Welcome {greetingName},</h2>
            <p className="mt-1 text-sm text-gray-500">
              Let us know where your business is &amp; we&apos;ll optimize NeoAccountingZ accordingly!
            </p>
          </div>

          {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          <div>
            <label className="label">
              Organization Name<span className="text-red-500">*</span>
            </label>
            <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
          </div>

          <div>
            <label className="label">
              Organization Location<span className="text-red-500">*</span>
            </label>
            <select className="input" value={newLocation} onChange={(e) => setNewLocation(e.target.value)}>
              <option value="" disabled>
                Select a location
              </option>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between border-t border-gray-100 pt-4">
            <div className="flex items-center gap-2">
              <button type="button" onClick={createOrganization} disabled={creating} className="btn-primary">
                {creating ? "Creating..." : "Let's get started!"}
              </button>
              <button type="button" onClick={closeCreateModal} className="btn-secondary">
                Cancel
              </button>
            </div>
            <span className="text-xs text-gray-400 underline decoration-gray-300">Privacy Policy</span>
          </div>
        </div>
      </Modal>
    </div>
  );
}
