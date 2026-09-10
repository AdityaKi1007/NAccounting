// Shared date-range defaults for the Reports section. Every report defaults to "this fiscal
// year to today" (Balance Sheet / AR Aging use a single "as of" date instead — see
// defaultAsOfDate) rather than an arbitrary fixed window, matching how Zoho's own reports
// default their range.

/** organizations.fiscal_year_start is stored as "MM-DD" (e.g. "01-01", "04-01"). Returns the
 * start of the fiscal year currently in progress (rolls back a year if today is before this
 * calendar year's fiscal start) through today, both as YYYY-MM-DD strings. */
export function defaultFiscalYearRange(fiscalYearStart: string | null | undefined): { from: string; to: string } {
  const [mmRaw, ddRaw] = (fiscalYearStart || "01-01").split("-");
  const mm = Math.min(Math.max(parseInt(mmRaw, 10) || 1, 1), 12);
  const dd = Math.min(Math.max(parseInt(ddRaw, 10) || 1, 1), 28);

  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  let startYear = today.getUTCFullYear();
  let candidateStart = Date.UTC(startYear, mm - 1, dd);
  if (todayUtc < candidateStart) {
    startYear -= 1;
    candidateStart = Date.UTC(startYear, mm - 1, dd);
  }

  return {
    from: new Date(candidateStart).toISOString().slice(0, 10),
    to: new Date(todayUtc).toISOString().slice(0, 10),
  };
}

/** Today, as a YYYY-MM-DD string — the default "as of" date for point-in-time reports. */
export function defaultAsOfDate(): string {
  return new Date().toISOString().slice(0, 10);
}
