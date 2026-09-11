// Shared client-side PDF generation, factored out of the three detail views that each had
// their own copy of this exact logic (Invoice, Sales Order, Payment Receipt) so the new Send
// Email feature can reuse it too (attach the same PDF a "Download PDF" click would produce,
// as a Blob, instead of triggering a browser download). This file has no server-side PDF
// capability of its own — it only works in the browser, called from inside a click handler —
// see the note in generatePdfBlob() below for why, and src/app/api/emails/route.ts for how
// the email-send API route still gets a PDF despite that (the client generates it and
// uploads the resulting blob, the same way a file upload works).

/** Renders `element` (typically a detail view's hidden/visible printable card, via a ref) to
 * a one-or-more-page A4 PDF and returns it as a Blob. Browser-only — do not call this from
 * server code or a Node API route; there is no DOM/canvas there for html2canvas to render
 * against. Every caller of this file is a "use client" component invoking it from inside an
 * event handler, which is what keeps this safe. */
export async function generatePdfBlob(element: HTMLElement, opts?: { scale?: number }): Promise<Blob> {
  // Import jsPDF's browser ESM build directly (not the bare "jspdf" specifier). jsPDF's
  // package.json exposes a "node" export condition pointing at dist/jspdf.node.min.js, which
  // pulls in canvg -> core-js. Next.js compiles this module's graph with the server (node)
  // resolver too, even though this code only ever runs in the browser inside a click handler
  // — so the bare specifier would drag that whole Node-only dependency chain into the server
  // bundle for no reason, and if core-js is even slightly incomplete in node_modules (as can
  // happen after an interrupted install — see the project's known-issues doc) the build fails
  // with "Module not found: Can't resolve '../internals/try-to-string'". Importing the dist
  // path directly bypasses the exports-condition resolution entirely, so only the small
  // browser build is ever used.
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf/dist/jspdf.es.min.js"),
  ]);
  const canvas = await html2canvas(element, { scale: opts?.scale ?? 2, backgroundColor: "#ffffff" });
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  let heightLeft = imgHeight;
  let position = 0;
  pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;
  while (heightLeft > 0) {
    position -= pageHeight;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }
  return pdf.output("blob");
}

/** Triggers a browser download of an already-generated PDF blob (what the old inline
 * `pdf.save(filename)` calls did, reimplemented here since generatePdfBlob returns a Blob
 * rather than the live jsPDF instance). */
export function downloadPdfBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
