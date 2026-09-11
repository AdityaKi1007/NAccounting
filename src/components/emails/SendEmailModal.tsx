"use client";

import { useEffect, useState } from "react";
import { Loader2, Paperclip } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { generatePdfBlob } from "@/lib/pdf-export";
import { defaultEmailSubject, defaultEmailBody, type EmailEntityType } from "@/lib/emails";

interface Props {
  open: boolean;
  onClose: () => void;
  entityType: EmailEntityType;
  entityId: string;
  /** Document number (e.g. "INV-000012") — used for the default subject/body and the
   * attached PDF's filename. */
  docNumber: string;
  orgName: string;
  /** Customer or vendor display name, for the default greeting. */
  partyName: string;
  /** The customer/vendor's email on file, if any — prefills To but stays editable, since the
   * user may want to send it somewhere else for this one send without changing the record. */
  defaultToEmail: string | null;
  /** Ref to the same printable card each detail view already renders for Download PDF —
   * reused here so the emailed PDF is byte-for-byte the same document (see
   * src/lib/pdf-export.ts). */
  printRef: React.RefObject<HTMLElement>;
  /** Called after a successful send, so the caller can refresh its EmailsList. */
  onSent?: () => void;
}

export default function SendEmailModal({
  open,
  onClose,
  entityType,
  entityId,
  docNumber,
  orgName,
  partyName,
  defaultToEmail,
  printRef,
  onSent,
}: Props) {
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed the form's defaults every time the modal opens (not on every keystroke) — a
  // plain useState initializer only runs once per mount, and this modal stays mounted
  // between opens, so this is what keeps re-opening it fresh instead of showing whatever was
  // typed (or cleared) last time.
  useEffect(() => {
    if (!open) return;
    setTo(defaultToEmail ?? "");
    setCc("");
    setSubject(defaultEmailSubject(entityType, docNumber, orgName));
    setBody(defaultEmailBody(entityType, { docNumber, orgName, partyName }));
    setError(null);
  }, [open, entityType, docNumber, orgName, partyName, defaultToEmail]);

  async function send() {
    if (!to.trim()) {
      setError("A recipient email is required.");
      return;
    }
    if (!printRef.current) {
      setError("Could not prepare the attachment — please try again.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const blob = await generatePdfBlob(printRef.current);
      const fd = new FormData();
      fd.append("entityType", entityType);
      fd.append("entityId", entityId);
      fd.append("to", to.trim());
      if (cc.trim()) fd.append("cc", cc.trim());
      fd.append("subject", subject);
      fd.append("body", body);
      fd.append("file", blob, `${docNumber}.pdf`);
      const res = await fetch("/api/emails", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not send this email.");
      onSent?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send this email.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Send Email" width="max-w-xl">
      <div className="space-y-4">
        <div>
          <label className="label">To</label>
          <input type="email" className="input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com" />
        </div>
        <div>
          <label className="label">Cc (optional)</label>
          <input type="email" className="input" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="name@example.com" />
        </div>
        <div>
          <label className="label">Subject</label>
          <input type="text" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div>
          <label className="label">Message</label>
          <textarea className="input" rows={7} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
          <Paperclip size={14} className="shrink-0 text-gray-400" />
          <span className="truncate">{docNumber}.pdf</span>
          <span className="shrink-0 text-xs text-gray-400">will be attached</span>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={sending}>
            Cancel
          </button>
          <button type="button" onClick={send} disabled={sending} className="btn-primary">
            {sending ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Sending...
              </>
            ) : (
              "Send Email"
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
