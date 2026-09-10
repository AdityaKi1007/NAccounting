// jsPDF's package.json maps the bare "jspdf" specifier to a "node" build (dist/jspdf.node.min.js)
// under Node's export-condition resolution, which pulls in canvg -> core-js and can break the
// build if that chain isn't fully installed (see InvoiceDetailView.tsx for the full story).
// We import the browser build's dist path directly to sidestep that, which needs its own
// ambient declaration since TypeScript doesn't resolve types for arbitrary subpath exports.
declare module "jspdf/dist/jspdf.es.min.js" {
  export * from "jspdf";
}
