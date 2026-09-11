"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Initial {
  smtp_host: string;
  smtp_port: number | null;
  smtp_user: string;
  smtp_from: string;
  smtp_secure: boolean;
  password_set: boolean;
}

export default function EmailSmtpSettingsForm({
  initial,
  defaultTestEmail,
  canManage,
}: {
  initial: Initial;
  defaultTestEmail: string;
  canManage: boolean;
}) {
  const router = useRouter();

  const [host, setHost] = useState(initial.smtp_host);
  const [port, setPort] = useState(initial.smtp_port != null ? String(initial.smtp_port) : "587");
  const [user, setUser] = useState(initial.smtp_user);
  const [password, setPassword] = useState("");
  const [passwordSet, setPasswordSet] = useState(initial.password_set);
  const [from, setFrom] = useState(initial.smtp_from);
  const [secure, setSecure] = useState(initial.smtp_secure);

  const [testTo, setTestTo] = useState(defaultTestEmail);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const disabled = !canManage;

  function currentValues() {
    return {
      smtp_host: host,
      smtp_port: Number(port),
      smtp_user: user,
      smtp_from: from,
      smtp_secure: secure,
      smtp_password: password || undefined,
    };
  }

  async function onSave() {
    setError(null);
    setMessage(null);
    if (!host.trim()) return setError("SMTP Host is required.");
    if (!user.trim()) return setError("SMTP Username is required.");
    if (!password && !passwordSet) return setError("SMTP Password is required.");

    setSaving(true);
    const res = await fetch("/api/settings/email-smtp", {
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
    if (password) setPasswordSet(true);
    setPassword("");
    setMessage("Saved.");
    router.refresh();
  }

  async function onTest() {
    setError(null);
    setMessage(null);
    if (!testTo.trim()) return setError("Enter an email address to send the test to.");
    setTesting(true);
    const res = await fetch("/api/settings/email-smtp/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...currentValues(), to: testTo }),
    });
    setTesting(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Test email failed.");
      return;
    }
    setMessage(`Test email sent to ${testTo}.`);
  }

  async function onDelete() {
    if (!window.confirm("Remove these SMTP settings? Emails will fall back to the app's default mail server, if any is configured, or stop sending until this is set up again.")) {
      return;
    }
    setError(null);
    setMessage(null);
    setDeleting(true);
    const res = await fetch("/api/settings/email-smtp", { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Could not remove these settings.");
      return;
    }
    setHost("");
    setPort("587");
    setUser("");
    setPassword("");
    setPasswordSet(false);
    setFrom("");
    setSecure(false);
    setMessage("Removed.");
    router.refresh();
  }

  return (
    <div className="max-w-2xl space-y-6">
      {!canManage && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Only owners and admins can change email settings. You can view the current settings below.
        </div>
      )}
      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>}

      <div className="card space-y-4 p-6">
        <p className="text-sm text-gray-500">
          Connect the SMTP server invoices, receipts and other emails should be sent through — works with
          Gmail, Office 365, Zoho Mail, or your own mail server.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">SMTP Host *</label>
            <input
              className="input"
              value={host}
              disabled={disabled}
              placeholder="smtp.gmail.com"
              onChange={(e) => setHost(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Port *</label>
            <input
              type="number"
              className="input"
              value={port}
              disabled={disabled}
              onChange={(e) => setPort(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Username *</label>
            <input
              className="input"
              value={user}
              disabled={disabled}
              placeholder="you@yourcompany.com"
              onChange={(e) => setUser(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Password {!passwordSet ? "*" : ""}</label>
            <input
              type="password"
              className="input"
              value={password}
              disabled={disabled}
              placeholder={passwordSet ? "Saved — leave blank to keep it" : ""}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="label">From Address</label>
            <input
              className="input"
              value={from}
              disabled={disabled}
              placeholder="Defaults to Username"
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                checked={secure}
                disabled={disabled}
                onChange={(e) => setSecure(e.target.checked)}
              />
              Use implicit TLS (only needed for a nonstandard port — 465 always uses it automatically)
            </label>
          </div>
        </div>
      </div>

      <div className="card space-y-3 p-6">
        <h2 className="text-sm font-semibold text-ink-800">Send a Test Email</h2>
        <p className="text-xs text-gray-400">
          Sends using whatever is currently in the form above — you don&apos;t need to save first.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <label className="label">Send test to</label>
            <input
              className="input"
              value={testTo}
              disabled={disabled}
              onChange={(e) => setTestTo(e.target.value)}
            />
          </div>
          <button onClick={onTest} disabled={testing || disabled} className="btn-secondary">
            {testing ? "Sending..." : "Send Test Email"}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-gray-100 pt-4">
        <button onClick={onSave} disabled={saving || disabled} className="btn-primary">
          {saving ? "Saving..." : "Save"}
        </button>
        {(initial.password_set || passwordSet) && (
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
