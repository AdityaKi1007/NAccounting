import { nav } from "@/lib/nav";

// Canonical module registry for the platform. Derived directly from nav.ts's leaf items so
// there is exactly one place ("nav.ts") that defines what modules exist — this file just
// gives each leaf a stable, URL-derived `key` that both the Super Admin module-toggle UI
// (organizations.disabled_modules) and the per-org Roles permission matrix (role_permissions)
// key off of. Adding a page to nav.ts automatically makes it a gate-able module here; no
// second list to keep in sync.
export interface ModuleDef {
  key: string;
  label: string;
  group: string;
  href: string;
}

export function keyFromHref(href: string): string {
  return href.replace(/^\//, "") || "home";
}

export const MODULE_LIST: ModuleDef[] = nav.flatMap((item): ModuleDef[] => {
  if (item.children) {
    return item.children.map((child) => ({
      key: keyFromHref(child.href),
      label: child.label,
      group: item.label,
      href: child.href,
    }));
  }
  if (!item.href) return [];
  return [{ key: keyFromHref(item.href), label: item.label, group: "General", href: item.href }];
});

// Home ("/") is the app's landing/dashboard page and is deliberately excluded from both the
// Super Admin module toggles and the Roles permission matrix — every member of an org needs
// somewhere to land after login regardless of what else is disabled for them.
export const GATEABLE_MODULES = MODULE_LIST.filter((m) => m.key !== "home");

export function moduleLabel(key: string): string {
  return MODULE_LIST.find((m) => m.key === key)?.label ?? key;
}

export const MODULE_KEYS = new Set(MODULE_LIST.map((m) => m.key));
