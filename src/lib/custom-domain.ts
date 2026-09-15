// Custom Domain (Settings -> Company -> Custom Domain) — 2026-09-15. An org picks a subdomain
// slug of this app's own domain (e.g. "companyname" -> companyname.accounting.propcrm.app);
// this is NOT a bring-your-own-external-domain feature (no CNAME/TXT DNS verification), scoped
// down after asking. See claude/known-issues-local-env-addendum-custom-domain-2026-09-15.md.

// App-wide constant rather than a per-org column — if the app's own domain ever changes, this
// is the one place to update it.
export const CUSTOM_DOMAIN_BASE = "accounting.propcrm.app";

// Slugs that would collide with a real route/subdomain this app (or a future one) already
// uses, or that would be confusing/misleading for a customer portal to sit at. Checked
// case-insensitively against the normalized subdomain.
export const RESERVED_SUBDOMAINS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "portal",
  "settings",
  "mail",
  "smtp",
  "ftp",
  "ns1",
  "ns2",
  "static",
  "assets",
  "cdn",
  "docs",
  "help",
  "support",
  "status",
  "blog",
  "dev",
  "staging",
  "test",
  "localhost",
  "accounting",
  "neoaccounting",
  "propcrm",
  "billing",
  "login",
  "signup",
  "dashboard",
  "root",
  "webmail",
  "autoconfig",
  "autodiscover",
]);

export function normalizeSubdomain(input: string): string {
  return input.trim().toLowerCase();
}

/**
 * Standard DNS-label rules, tightened slightly for a subdomain a person will type and read
 * back to a customer: lowercase letters, digits and hyphens only; must start and end with a
 * letter or digit (no leading/trailing hyphen); 3-63 characters (63 is the real DNS label
 * limit; 3 keeps single/double-character slugs, which are more likely typos than real company
 * names, out).
 */
const SUBDOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/;

export function subdomainValidationError(rawInput: string): string | null {
  const value = normalizeSubdomain(rawInput);
  if (!value) return "Enter a subdomain.";
  if (value.length < 3) return "Subdomain must be at least 3 characters.";
  if (value.length > 63) return "Subdomain must be 63 characters or fewer.";
  if (!SUBDOMAIN_PATTERN.test(value)) {
    return "Use only lowercase letters, numbers and hyphens, and don't start or end with a hyphen.";
  }
  if (RESERVED_SUBDOMAINS.has(value)) return `"${value}" is reserved and can't be used.`;
  return null;
}

export function fullCustomDomain(subdomain: string): string {
  return `${normalizeSubdomain(subdomain)}.${CUSTOM_DOMAIN_BASE}`;
}
