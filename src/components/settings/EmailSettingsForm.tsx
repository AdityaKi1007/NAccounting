"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Provider = "smtp" | "sendgrid" | "ses";

interface SmtpInitial {
  host: string;
  port: number | null;
  user: string;
  from: string;
  from_name: string;
  secure: boolean;
  password_set: boolean;
}

interface SendgridInitial {
  from_name: string;
  from_email: string;
  api_key_set: boolean;
}

interface SesInitial {
  access_key_id: string;
  region: string;
  from_name: string;
  from_email: string;
  secret_key_set: boolean;
}

interface Initial {
  active_provider: Provider | null;
  smtp: SmtpInitial;
  sendgrid: SendgridInitial;
  ses: SesInitial;
}

const PROVIDER_LABELS: Record<Provider, string> = {
  smtp: "SMTP (own mail server)",
  sendgrid: "SendGrid",
  ses: "AWS SES",
};

// Everything currently saved for a provider we're not looking at (the two providers not shown
// in the field card right now) still needs to make the round trip on Save, because the PATCH
// endpoint only accepts the provider named in the request — switching providers by picking a
// new one in the dropdown and saving must never require re-entering the provider you're
// switching *away* from. Holding all three providers' state at once, independent of which one
// is selected, is what makes that work.
export default function EmailSettingsForm({
  initial,
  defaultTestEmail,
  canManage,
}: {
  initial: Initial;
  defaultTestEmail: string;
  canManage: boolean;
}) {
  const router = useRouter();

  const [provider, setProvider] = useState<Provider>(initial.active_provider ?? "smtp");
  const [activeProvider, setActiveProvider] = useState<Provider | null>(initial.active_provider);

  // SMTP
  const [smtpHost, setSmtpHost] = useState(initial.smtp.host);
  const [smtpPort, setSmtpPort] = useState(initial.smtp.port != null ? String(initial.smtp.port) : "587");
  const [smtpUser, setSmtpUser] = useState(initial.smtp.user);
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpPasswordSet, setSmtpPasswordSet] = useState(initial.smtp.password_set);
  const [smtpFrom, setSmtpFrom] = useState(initial.smtp.from);
  const [smtpFromName, setSmtpFromName] = useState(initial.smtp.from_name);
  const [smtpSecure, setSmtpSecure] = useState(initial.smtp.secure);

  // SendGrid
  const [sgApiKey, setSgApiKey] = useState("");
  const [sgApiKeySet, setSgApiKeySet] = useState(initial.sendgrid.api_key_set);
  const [sgFromEmail, setSgFromEmail] = useState(initial.sendgrid.from_email);
  const [sgFromName, setSgFromName] = useState(initial.sendgrid.from_name);

  // AWS SES
  const [sesAccessKeyId, setSesAccessKeyId] = useState(initial.ses.access_key_id);
  const [sesSecretKey, setSesSecretKey] = useState("");
  const [sesSecretKeySet, setSesSecretKeySet] = useState(initial.ses.secret_key_set);
  const [sesRegion, setSesRegion] = useState(initial.ses.region);
  const [sesFromEmail, setSesFromEmail] = useState(initial.ses.from_email);
  const [sesFromName, setSesFromName] = useState(initial.ses.from_name);

  const [testTo, setTestTo] = useState(defaultTestEmail);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const disabled = !canManage;

  function currentProviderHasSecretSaved() {
    if (provider === "smtp") return smtpPasswordSet;
    if (provider === "sendgrid") return sgApiKeySet;
    return sesSecretKeySet;
  }

  function currentValues(): Record<string, unknown> {
    if (provider === "smtp") {
      return {
        provider,
        smtp_host: smtpHost,
        smtp_port: Number(smtpPort),
        smtp_user: smtpUser,
        smtp_from: smtpFrom,
        smtp_from_name: smtpFromName,
        smtp_secure: smtpSecure,
        smtp_password: smtpPassword || undefined,
      };
    }
    if (provider === "sendgrid") {
      return {
        provider,
        sendgrid_from_email: sgFromEmail,
        sendgrid_from_name: sgFromName,
        sendgrid_api_key: sgApiKey || undefined,
      };
    }
    return {
      provider,
      ses_access_key_id: sesAccessKeyId,
      ses_region: sesRegion,
      ses_from_email: sesFromEmail,
      ses_from_name: sesFromName,
      ses_secret_access_key: sesSecretKey || undefined,
    };
  }

  function validate(): string | null {
    if (provider === "smtp") {
      if (!smtpHost.trim()) return "SMTP Host is required.";
      if (!smtpUser.trim()) return "SMTP Username is required.";
      if (!smtpPassword && !smtpPasswordSet) return "SMTP Password is required.";
    } else if (provider === "sendgrid") {
      if (!sgFromEmail.trim()) return "From email is required.";
      if (!sgApiKey && !sgApiKeySet) return "API Key is required.";
    } else {
      if (!sesAccessKeyId.trim()) return "Access Key ID is required.";
      if (!sesRegion.trim()) return "Region is required.";
      if (!sesFromEmail.trim()) return "From email is required.";
      if (!sesSecretKey && !sesSecretKeySet) return "Secret Access Key is required.";
    }
    return null;
  }

  async function onSave() {
    setError(null);
    setMessage(null);
    const validationError = validate();
    if (validationError) return setError(validationError);

    setSaving(true);
    const res = await fetch("/api/settings/email", {
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
    if (provider === "smtp") {
      if (smtpPassword) setSmtpPasswordSet(true);
      setSmtpPassword("");
    } else if (provider === "sendgrid") {
      if (sgApiKey) setSgApiKeySet(true);
      setSgApiKey("");
    } else {
      if (sesSecretKey) setSesSecretKeySet(true);
      setSesSecretKey("");
    }
    setActiveProvider(provider);
    setMessage(`Saved — ${PROVIDER_LABELS[provider]} is now the active provider.`);
    router.refresh();
  }

  async function onTest() {
    setError(null);
    setMessage(null);
    if (!testTo.trim()) return setError("Enter an email address to send the test to.");
    const validationError = validate();
    if (validationError) return setError(validationError);

    setTesting(true);
    const res = await fetch("/api/settings/email/test", {
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
    if (
      !window.confirm(
        `Remove your saved ${PROVIDER_LABELS[provider]} settings? ${
          activeProvider === provider
            ? "Emails will fall back to another configured provider, the app's default mail server if any, or stop sending until this is set up again."
            : ""
        }`
      )
    ) {
      return;
    }
    setError(null);
    setMessage(null);
    setDeleting(true);
    const res = await fetch(`/api/settings/email?provider=${provider}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Could not remove these settings.");
      return;
    }
    if (provider === "smtp") {
      setSmtpHost("");
      setSmtpPort("587");
      setSmtpUser("");
      setSmtpPassword("");
      setSmtpPasswordSet(false);
      setSmtpFrom("");
      setSmtpFromName("");
      setSmtpSecure(false);
    } else if (provider === "sendgrid") {
      setSgApiKey("");
      setSgApiKeySet(false);
      setSgFromEmail("");
      setSgFromName("");
    } else {
      setSesAccessKeyId("");
      setSesSecretKey("");
      setSesSecretKeySet(false);
      setSesRegion("");
      setSesFromEmail("");
      setSesFromName("");
    }
    setActiveProvider((prev) => (prev === provider ? null : prev));
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
          Connect the provider invoices, receipts and other emails should be sent through. You can save
          connection details for more than one provider — only the one marked active below is actually used
          to send mail.
        </p>
        <div>
          <label className="label">Provider</label>
          <select
            className="input"
            value={provider}
            disabled={disabled}
            onChange={(e) => {
              setError(null);
              setMessage(null);
              setProvider(e.target.value as Provider);
            }}
          >
            <option value="smtp">{PROVIDER_LABELS.smtp}</option>
            <option value="sendgrid">{PROVIDER_LABELS.sendgrid}</option>
            <option value="ses">{PROVIDER_LABELS.ses}</option>
          </select>
          <p className="mt-1 text-xs text-gray-400">
            {activeProvider === provider
              ? `${PROVIDER_LABELS[provider]} is currently active.`
              : activeProvider
                ? `Currently active: ${PROVIDER_LABELS[activeProvider]}. Saving below switches to ${PROVIDER_LABELS[provider]}.`
                : `No provider is active yet. Saving below makes ${PROVIDER_LABELS[provider]} active.`}
          </p>
        </div>

        {provider === "smtp" && (
          <div className="grid grid-cols-1 gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2">
            <div>
              <label className="label">SMTP Host *</label>
              <input
                className="input"
                value={smtpHost}
                disabled={disabled}
                placeholder="smtp.gmail.com"
                onChange={(e) => setSmtpHost(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Port *</label>
              <input
                type="number"
                className="input"
                value={smtpPort}
                disabled={disabled}
                onChange={(e) => setSmtpPort(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Username *</label>
              <input
                className="input"
                value={smtpUser}
                disabled={disabled}
                placeholder="you@yourcompany.com"
                onChange={(e) => setSmtpUser(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Password {!smtpPasswordSet ? "*" : ""}</label>
              <input
                type="password"
                className="input"
                value={smtpPassword}
                disabled={disabled}
                placeholder={smtpPasswordSet ? "Saved — leave blank to keep it" : ""}
                onChange={(e) => setSmtpPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="label">From Name</label>
              <input
                className="input"
                value={smtpFromName}
                disabled={disabled}
                placeholder="Your Company"
                onChange={(e) => setSmtpFromName(e.target.value)}
              />
            </div>
            <div>
              <label className="label">From Address</label>
              <input
                className="input"
                value={smtpFrom}
                disabled={disabled}
                placeholder="Defaults to Username"
                onChange={(e) => setSmtpFrom(e.target.value)}
              />
            </div>
            <div className="flex items-end pb-2 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm text-ink-700">
                <input
                  type="checkbox"
                  checked={smtpSecure}
                  disabled={disabled}
                  onChange={(e) => setSmtpSecure(e.target.checked)}
                />
                Use implicit TLS (only needed for a nonstandard port — 465 always uses it automatically)
              </label>
            </div>
          </div>
        )}

        {provider === "sendgrid" && (
          <div className="grid grid-cols-1 gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">API Key {!sgApiKeySet ? "*" : ""}</label>
              <input
                type="password"
                className="input"
                value={sgApiKey}
                disabled={disabled}
                placeholder={sgApiKeySet ? "Saved — leave blank to keep it" : "SG.xxxxxxxx"}
                onChange={(e) => setSgApiKey(e.target.value)}
              />
            </div>
            <div>
              <label className="label">From Name</label>
              <input
                className="input"
                value={sgFromName}
                disabled={disabled}
                placeholder="Your Company"
                onChange={(e) => setSgFromName(e.target.value)}
              />
            </div>
            <div>
              <label className="label">From Email *</label>
              <input
                className="input"
                value={sgFromEmail}
                disabled={disabled}
                placeholder="billing@yourcompany.com"
                onChange={(e) => setSgFromEmail(e.target.value)}
              />
            </div>
            <p className="text-xs text-gray-400 sm:col-span-2">
              The From Email must be a verified sender identity in your SendGrid account.
            </p>
          </div>
        )}

        {provider === "ses" && (
          <div className="grid grid-cols-1 gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2">
            <div>
              <label className="label">Access Key ID *</label>
              <input
                className="input"
                value={sesAccessKeyId}
                disabled={disabled}
                placeholder="AKIAxxxxxxxx"
                onChange={(e) => setSesAccessKeyId(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Secret Access Key {!sesSecretKeySet ? "*" : ""}</label>
              <input
                type="password"
                className="input"
                value={sesSecretKey}
                disabled={disabled}
                placeholder={sesSecretKeySet ? "Saved — leave blank to keep it" : ""}
                onChange={(e) => setSesSecretKey(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Region *</label>
              <input
                className="input"
                value={sesRegion}
                disabled={disabled}
                placeholder="us-east-1"
                onChange={(e) => setSesRegion(e.target.value)}
              />
            </div>
            <div>
              <label className="label">From Name</label>
              <input
                className="input"
                value={sesFromName}
                disabled={disabled}
                placeholder="Your Company"
                onChange={(e) => setSesFromName(e.target.value)}
              />
            </div>
            <div>
              <label className="label">From Email *</label>
              <input
                className="input"
                value={sesFromEmail}
                disabled={disabled}
                placeholder="billing@yourcompany.com"
                onChange={(e) => setSesFromEmail(e.target.value)}
              />
            </div>
            <p className="text-xs text-gray-400 sm:col-span-2">
              The From Email must be a verified identity in SES for the region above.
            </p>
          </div>
        )}
      </div>

      <div className="card space-y-3 p-6">
        <h2 className="text-sm font-semibold text-ink-800">Send a Test Email</h2>
        <p className="text-xs text-gray-400">
          Sends using whatever is currently in the {PROVIDER_LABELS[provider]} form above — you don&apos;t
          need to save first.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <label className="label">Send test to</label>
            <input className="input" value={testTo} disabled={disabled} onChange={(e) => setTestTo(e.target.value)} />
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
        {currentProviderHasSecretSaved() && (
          <button
            onClick={onDelete}
            disabled={deleting || disabled}
            className="text-sm text-red-600 hover:underline disabled:opacity-50"
          >
            {deleting ? "Removing..." : `Remove ${PROVIDER_LABELS[provider]} settings`}
          </button>
        )}
      </div>
    </div>
  );
}
