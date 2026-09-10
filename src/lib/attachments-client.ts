// Shared helper for every create form's "attach files while creating" flow (Sales Orders,
// Purchase Orders, Payments Received, Customers, Vendors — see AttachmentsField.tsx's
// staged mode). The form itself can't upload a file until the parent record exists (an
// attachment always belongs to a real, saved entity_id), so files picked during "New ..."
// are held in memory by the form and only actually uploaded here, right after the create
// API call returns the new record's id, just before redirecting away.

export async function uploadPendingAttachments(
  entityType: string,
  entityId: string,
  files: File[]
): Promise<string[]> {
  const errors: string[] = [];
  for (const file of files) {
    const fd = new FormData();
    fd.append("entityType", entityType);
    fd.append("entityId", entityId);
    fd.append("file", file);
    const res = await fetch("/api/attachments", { method: "POST", body: fd });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      errors.push(`${file.name}: ${typeof data.error === "string" ? data.error : "upload failed"}`);
    }
  }
  return errors;
}
