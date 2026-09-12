"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { nav, type NavItem } from "@/lib/nav";
import { keyFromHref } from "@/lib/modules";
import clsx from "clsx";

// Filters the static nav down to modules this member is actually allowed to see — the
// "hidden from nav" half of the platform's module-access feature (see
// src/lib/module-access.ts's getVisibleModuleKeys, called from (app)/layout.tsx). Home
// (href "/") is never in visibleModuleKeys (see modules.ts) and always passes through
// unfiltered — every member needs somewhere to land after login. A parent group whose every
// child gets filtered out is dropped entirely rather than shown empty.
function filterNav(items: NavItem[], visible: Set<string>): NavItem[] {
  return items
    .map((item) => {
      if (item.children) {
        const children = item.children.filter((c) => visible.has(keyFromHref(c.href)));
        if (children.length === 0) return null;
        return { ...item, children };
      }
      if (!item.href || item.href === "/" || visible.has(keyFromHref(item.href))) return item;
      return null;
    })
    .filter((item): item is NavItem => item !== null);
}

export default function Sidebar({ visibleModuleKeys }: { visibleModuleKeys: string[] }) {
  const pathname = usePathname();
  const visible = new Set(visibleModuleKeys);
  const filteredNav = filterNav(nav, visible);

  const initialOpen = new Set<string>();
  for (const item of filteredNav) {
    if (item.children?.some((c) => pathname === c.href)) initialOpen.add(item.label);
  }
  if (initialOpen.size === 0) initialOpen.add("Items");
  const [open, setOpen] = useState<Set<string>>(initialOpen);

  function toggle(label: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col overflow-y-auto border-r border-gray-200 bg-white py-2">
      <nav className="flex-1 px-2">
        {filteredNav.map((item) => {
          const Icon = item.icon;
          if (!item.children) {
            const active = pathname === item.href;
            return (
              <Link
                key={item.label}
                href={item.href ?? "#"}
                className={clsx(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium",
                  active ? "bg-brand-50 text-brand-700" : "text-ink-700 hover:bg-gray-100"
                )}
              >
                <Icon size={17} strokeWidth={2} />
                {item.label}
              </Link>
            );
          }

          const isOpen = open.has(item.label);
          const hasActiveChild = item.children.some((c) => pathname === c.href);

          return (
            <div key={item.label} className="mb-0.5">
              <button
                type="button"
                onClick={() => toggle(item.label)}
                className={clsx(
                  "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium",
                  hasActiveChild ? "text-brand-700" : "text-ink-700 hover:bg-gray-100"
                )}
              >
                <Icon size={17} strokeWidth={2} />
                <span className="flex-1 text-left">{item.label}</span>
                {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              </button>
              {isOpen && (
                <div className="ml-[1.6rem] mt-0.5 space-y-0.5 border-l border-gray-200 pl-3">
                  {item.children.map((child) => {
                    const active = pathname === child.href;
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={clsx(
                          "block rounded-md px-2.5 py-1.5 text-sm",
                          active
                            ? "bg-brand-50 font-medium text-brand-700"
                            : "text-ink-700 hover:bg-gray-100"
                        )}
                      >
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
