"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Mail, MailWarning } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import type { EmailEntityType, EmailPartyType } from "@/lib/emails";

interface SentEmail {
  id: string;
  to_email: string;
  cc_email: string | null;
  subject: string;
  body: string;
  attachment_file_name: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

type Props =
  | { entityType: EmailEntityType; entityId: string; partyType?: undefined; partyId?: undefined; refreshSignal?: number }
  | { partyType: EmailPartyType; partyId: string; entityType?: undefined; entityId?: undefined; refreshSignal?: number };

/** Shows the log of emails sent about one document (entityType+entityId — used on the
 * Invoice/Sales Order/Purchase Order/Payment Receipt detail pages) or filed under one
 * customer/vendor (partyType+partyId — used on the Customer/Vendor profile pages), per
 * src/app/api/emails/route.ts's GET. Bump `refreshSignal` (e.g. a counter incremented in
 * SendEmailModal's onSent) to refetch after a new email is sent. */
export default function EmailsList(props: Props) {
  const [emails, setEmails] = useState<SentEmail[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { entityType, entityId, partyType, partyId, refreshSignal } = props;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = entityType
      ? `entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`
      : `partyType=${encodeURIComponent(partyType!)}&partyId=${encodeURIComponent(partyId!)}`;
    fetch(`/api/emails?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setEmails(data.emails ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId, partyType, partyId, refreshSignal]);

  if (loading) return <p className="text-xs text-gray-400">Loading emails...</p>;

  if (emails.length === 0) {
    return (
      <p className="flex items-center gap-2 py-2 text-sm text-gray-400">
        <Mail size={16} className="text-gray-300" /> No emails sent yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {emails.map((e) => {
        const isOpen = expanded === e.id;
        return (
          <div key={e.id} className="rounded-md border border-gray-200">
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : e.id)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
            >
              <div className="flex min-w-0 items-center gap-2">
                {isOpen ? (
                  <ChevronDown size={14} className="shrink-0 text-gray-400" />
                ) : (
                  <ChevronRight size={14} className="shrink-0 text-gray-400" />
                )}
                {e.status === "failed" ? (
                  <MailWarning size={14} className="shrink-0 text-red-500" />
                ) : (
                  <Mail size={14} className="shrink-0 text-gray-400" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-800">{e.subject}</p>
                  <p className="truncate text-xs text-gray-500">To: {e.to_email}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    e.status === "failed" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {e.status === "failed" ? "Failed" : "Sent"}
                </span>
                <span className="text-xs text-gray-400">{formatDateTime(e.created_at)}</span>
              </div>
            </button>
            {isOpen && (
              <div className="border-t border-gray-100 px-3 py-2.5 text-sm">
                {e.cc_email && <p className="text-xs text-gray-500">Cc: {e.cc_email}</p>}
                {e.attachment_file_name && <p className="text-xs text-gray-500">Attachment: {e.attachment_file_name}</p>}
                <p className="mt-2 whitespace-pre-line text-ink-700">{e.body}</p>
                {e.status === "failed" && e.error_message && (
                  <p className="mt-2 text-xs text-red-600">Error: {e.error_message}</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
