export function formatCurrency(value: unknown, currency = "AED") {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? 0));
  if (!Number.isFinite(n)) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "code",
  }).format(n);
}

/** "AED 48.62M" / "AED 12.5K" style compact notation — used only on the CFO Dashboard, where
 * space is tight and figures are large; every other report keeps formatCurrency's full
 * precision for exactness, so this is deliberately not a drop-in replacement for it. */
export function formatCompactCurrency(value: unknown, currency = "AED") {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? 0));
  if (!Number.isFinite(n)) return "-";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  let compact: string;
  if (abs >= 1_000_000) compact = `${(abs / 1_000_000).toFixed(2)}M`;
  else if (abs >= 1_000) compact = `${(abs / 1_000).toFixed(1)}K`;
  else compact = abs.toFixed(2);
  return `${sign}${currency} ${compact}`;
}

// DD/MM/YYYY everywhere, by request — "en-GB" + all-numeric fields is what actually produces
// slash-separated DD/MM/YYYY (as opposed to "en-GB" with month:"short", which was the previous
// "14 Sep 2026" style). Every one of this app's ~45 formatDate call sites and 7 formatDateTime
// call sites (list/table views, detail pages, reports, and — since PDFs are a straight
// html2canvas screenshot of the live DOM, see src/lib/pdf-export.ts — every printed/PDF'd
// document too) picks this up automatically from this one place.
export function formatDate(value: unknown) {
  if (!value) return "-";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

export function formatDateTime(value: unknown) {
  if (!value) return "-";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function toDateInputValue(value: unknown) {
  if (!value) return "";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function titleCase(value: unknown) {
  return String(value ?? "")
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

// Multiplication mod 10^9 is a bijection as long as the multiplier shares no factor with
// 10^9 (= 2^9 * 5^9) — this one is odd and not a multiple of 5, so it qualifies. That
// bijection is what guarantees every organization's sequence number maps to a distinct
// 9-digit ID; a hash would only make collisions unlikely, not impossible.
const ORG_ID_MULTIPLIER = 1_030_297;
const ORG_ID_OFFSET = 314_159_265;
const ORG_ID_MODULUS = 1_000_000_000;

/**
 * Turns an organization's sequential signup counter (org_seq, guaranteed unique and
 * assigned by a database sequence) into a non-sequential-looking 9-digit display ID.
 * Deterministic and collision-free: distinct org_seq values always produce distinct IDs.
 */
export function orgDisplayId(orgSeq: number | string) {
  const seq = Number(orgSeq);
  const scrambled = ((seq * ORG_ID_MULTIPLIER) % ORG_ID_MODULUS + ORG_ID_OFFSET) % ORG_ID_MODULUS;
  return String(scrambled).padStart(9, "0");
}
