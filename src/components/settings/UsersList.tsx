"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, UserPlus } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { formatDate } from "@/lib/format";

interface UserRow {
  membership_id: string;
  role: string;
  joined_at: string;
  user_id: string;
  name: string;
  email: string;
}

export default function UsersList({ users, canManage }: { users: UserRow[]; canManage: boolean }) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("staff");
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  function openModal() {
    setName("");
    setEmail("");
    setRole("staff");
    setError(null);
    setTempPassword(null);
    setModalOpen(true);
  }

  async function onInvite() {
    setError(null);
    setSaving(true);
    const res = await fetch("/api/settings/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, role }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Could not add this user.");
      return;
    }
    const data = await res.json();
    if (data.tempPassword) {
      setTempPassword(data.tempPassword);
    } else {
      setModalOpen(false);
    }
    router.refresh();
  }

  async function onRemove(membershipId: string) {
    await fetch(`/api/settings/users/${membershipId}`, { method: "DELETE" });
    setConfirmId(null);
    router.refresh();
  }

  return (
    <div>
      {canManage && (
        <div className="mb-4 flex justify-end">
          <button onClick={openModal} className="btn-primary">
            <Plus size={16} /> Invite User
          </button>
        </div>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Email</th>
              <th className="px-4 py-2.5">Role</th>
              <th className="px-4 py-2.5">Joined</th>
              {canManage && <th className="px-4 py-2.5 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u) => (
              <tr key={u.membership_id}>
                <td className="px-4 py-2.5 text-ink-800">{u.name}</td>
                <td className="px-4 py-2.5 text-ink-700">{u.email}</td>
                <td className="px-4 py-2.5 capitalize text-ink-700">{u.role}</td>
                <td className="px-4 py-2.5 text-ink-700">{formatDate(u.joined_at)}</td>
                {canManage && (
                  <td className="px-4 py-2.5 text-right">
                    {u.role === "owner" ? (
                      <span className="text-xs text-gray-400">Owner</span>
                    ) : confirmId === u.membership_id ? (
                      <button
                        onClick={() => onRemove(u.membership_id)}
                        className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                      >
                        Confirm
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmId(u.membership_id)}
                        className="rounded-md p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
                        title="Remove"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Invite User">
        {tempPassword ? (
          <div className="space-y-4">
            <div className="rounded-md bg-green-50 px-3 py-3 text-sm text-green-800">
              <p className="mb-1 font-medium">User added.</p>
              <p>
                Since this app doesn&apos;t send invite emails yet, share these sign-in details with them
                directly:
              </p>
              <p className="mt-2 rounded bg-white px-2 py-1 font-mono text-xs">
                {email} / {tempPassword}
              </p>
              <p className="mt-2 text-xs text-green-700">They should change their password after signing in.</p>
            </div>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <div>
              <label className="label">Name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="label">
                Email<span className="text-red-500"> *</span>
              </label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="label">Role</label>
              <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="admin">Admin</option>
                <option value="staff">Staff</option>
              </select>
            </div>
            <div className="flex items-center gap-2 border-t border-gray-100 pt-4">
              <button onClick={onInvite} disabled={saving} className="btn-primary">
                <UserPlus size={15} />
                {saving ? "Adding..." : "Add User"}
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
