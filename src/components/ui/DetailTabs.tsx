"use client";

import { useState, type ReactNode } from "react";

export interface DetailTabItem {
  key: string;
  label: string;
  content: ReactNode;
}

/** Generic tab switcher for a record's detail page — a row of tab buttons plus the active
 * tab's content. Each tab's `content` is typically JSX already rendered by a Server
 * Component (including nested Client Components like AttachmentsField/EmailsList, or a
 * bespoke client view like CustomerStatementView) — valid in the App Router since a Server
 * Component can be passed as a prop/children into a Client Component. This file only needs
 * "use client" for the useState that drives which tab is visible.
 *
 * Every tab's content is mounted at all times (hidden via the `hidden` attribute rather than
 * conditional rendering) so switching tabs never remounts a tab's own state — e.g. the
 * Statement tab's date-range selection or an open Send Email modal would otherwise reset
 * every time you tabbed away and back.
 *
 * First used by the Customer detail page (Overview / Transactions / Statement) — see
 * src/app/(app)/customers/[id]/page.tsx. */
export default function DetailTabs({ tabs, defaultTabKey }: { tabs: DetailTabItem[]; defaultTabKey?: string }) {
  const [active, setActive] = useState(defaultTabKey && tabs.some((t) => t.key === defaultTabKey) ? defaultTabKey : tabs[0]?.key);

  return (
    <div>
      <div className="no-print border-b border-gray-200 bg-white px-6">
        <nav className="-mb-px flex gap-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(t.key)}
              className={`border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                active === t.key ? "border-brand-600 text-brand-600" : "border-transparent text-gray-500 hover:text-ink-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>
      {tabs.map((t) => (
        <div key={t.key} hidden={active !== t.key}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
