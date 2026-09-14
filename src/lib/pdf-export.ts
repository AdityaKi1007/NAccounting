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
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;

  // Slice the one big canvas into a separate, page-sized canvas per page and embed each slice
  // on its own page, rather than (as this used to) re-embedding the entire full-height image
  // on every single page and relying on the page boundary to clip the overflow off-screen.
  // That approach rendered correctly — a PDF viewer clips content outside the page — but for
  // any document beyond a page or two it silently bloated the file to N copies of the whole
  // image (found while adding the API Reference's multi-page "Download PDF": a 10-page
  // document came out to ~95MB). Slicing keeps each page's embedded image only as large as
  // that page's own content, so total embedded pixel data stays roughly one copy of the
  // source canvas no matter how many pages it spans — a single-page document (every existing
  // caller today) takes the same one-iteration path as before, so this changes nothing for
  // those, only fixes multi-page ones.
  const pxPerPt = canvas.width / imgWidth;
  const pageHeightPx = Math.max(1, Math.round(pageHeight * pxPerPt));
  let renderedPx = 0;
  let firstPage = true;
  while (renderedPx < canvas.height) {
    const sliceHeightPx = Math.min(pageHeightPx, canvas.height - renderedPx);
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHeightPx;
    const ctx = pageCanvas.getContext("2d");
    if (!ctx) break;
    ctx.drawImage(canvas, 0, renderedPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);
    const sliceImgData = pageCanvas.toDataURL("image/png");
    const sliceHeightPt = sliceHeightPx / pxPerPt;
    if (!firstPage) pdf.addPage();
    // "FAST" turns on jsPDF's own Flate compression of the embedded bitmap — without it,
    // addImage stores the fully-decoded raw pixel data uncompressed inside the PDF (a lossless
    // change; this is exactly what a mostly-white, high-contrast rendering like this compresses
    // extremely well with, cutting file size by roughly an order of magnitude in testing).
    pdf.addImage(sliceImgData, "PNG", 0, 0, imgWidth, sliceHeightPt, undefined, "FAST");
    renderedPx += sliceHeightPx;
    firstPage = false;
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
