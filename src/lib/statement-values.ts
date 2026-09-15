// Pure value-parsing helpers shared by the statement-import wizard's client-side Map
// Fields/Preview steps (StatementImportWizard.tsx builds the normalized transaction list in
// the browser as the user maps columns) and the server-side confirm route (which re-derives
// the same values from the raw cells it's given, rather than trusting numbers computed in the
// browser). Deliberately has zero Node-specific imports (no fs/child_process/exceljs) so it's
// safe to import from a "use client" component — see statement-import.ts for the actual file
// parsing, which does need those and must stay server-only.

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export type DateFormatHint = "DMY" | "MDY" | "YMD";

/** Parses a wide variety of bank-statement date spellings into an ISO "YYYY-MM-DD" string, or
 * null if unrecognized. `hint` resolves the ambiguous numeric case (01/02/2026): DMY (this
 * app's own DD/MM/YYYY display convention — see the date-format addendum) is the default. An
 * unambiguous case (day > 12, or a month name) is always read correctly regardless of hint. */
export function parseStatementDate(raw: string, hint: DateFormatHint = "DMY"): string | null {
  const s = raw.trim();
  if (!s) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const named = /^(\d{1,2})[\/\-. ]([A-Za-z]{3,9})[\/\-. ](\d{2,4})$/.exec(s);
  if (named) {
    const month = MONTH_NAMES[named[2].slice(0, 3).toLowerCase()];
    if (month) {
      const day = Number(named[1]);
      const year = named[3].length === 2 ? 2000 + Number(named[3]) : Number(named[3]);
      return isoOrNull(year, month, day);
    }
  }

  const numeric = /^(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})$/.exec(s);
  if (numeric) {
    const [, a, b, c] = numeric;
    if (a.length === 4) return isoOrNull(Number(a), Number(b), Number(c)); // YYYY-MM-DD-ish
    const first = Number(a);
    const second = Number(b);
    const year = c.length === 2 ? 2000 + Number(c) : Number(c);
    if (first > 12 && second <= 12) return isoOrNull(year, second, first); // unambiguous D/M
    if (second > 12 && first <= 12) return isoOrNull(year, first, second); // unambiguous M/D
    return hint === "MDY" ? isoOrNull(year, first, second) : isoOrNull(year, second, first);
  }

  return null;
}

function isoOrNull(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Parses a bank statement amount cell into a plain positive/negative number: strips currency
 * symbols/codes and thousands separators, treats parentheses and a trailing "DR"/"Dr" as
 * negative, a trailing "CR"/"Cr" as positive. Returns null if nothing numeric is found. */
export function parseStatementAmount(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  const drCr = /\b(DR|CR)\b\s*$/i.exec(s);
  if (drCr) {
    if (drCr[1].toUpperCase() === "DR") negative = true;
    s = s.slice(0, drCr.index).trim();
  }
  s = s.replace(/[^\d.,+-]/g, "");
  if (!s) return null;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  // Thousands separator vs. decimal separator: strip commas (thousands) unless the string has
  // no dot at all and a comma sits exactly 2 digits from the end (a European decimal comma).
  if (s.includes(",") && !s.includes(".") && /,\d{2}$/.test(s)) {
    s = s.replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -Math.abs(n) : n;
}
