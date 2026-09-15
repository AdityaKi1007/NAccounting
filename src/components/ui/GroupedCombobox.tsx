"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Search, Check } from "lucide-react";

export interface GroupedComboboxOption {
  value: string;
  label: string;
  /** Display group header this option is listed under (e.g. "Bank", "Cash", "Other Current
   * Liability" — see depositToGroupLabel in src/lib/accounts.ts). Consecutive options sharing
   * a group render under one header. */
  group: string;
}

/**
 * Combobox.tsx's sibling for a picker whose options fall into named categories — built for
 * "Deposit To" (RecordPaymentForm.tsx) / "Paid Through" (RecordPaymentMadeForm.tsx) against a
 * Zoho Books reference screenshot (2026-09-15) showing accounts grouped under "Bank" / "Cash" /
 * "Other Current Liability" headers with a search box and a checkmark on the selected option.
 * Everything else (click-to-open, type-to-filter, click-outside-to-close, NO RESULTS FOUND)
 * mirrors Combobox.tsx exactly — kept as a separate component rather than adding an optional
 * `group` prop to Combobox itself, so every other (ungrouped) use of Combobox is untouched.
 *
 * Search filters across every group by an option's own label (not its group name), then only
 * the groups that still have at least one matching option are shown — an empty group never
 * renders a header of its own. Groups render in the order options first appear in `options`,
 * not alphabetically — callers pass options pre-ordered the way they want groups to appear.
 */
export default function GroupedCombobox({
  options,
  value,
  onChange,
  placeholder = "Select...",
  searchPlaceholder = "Search",
  disabled = false,
}: {
  options: GroupedComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const selected = options.find((o) => o.value === value);
  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  const groups: { label: string; options: GroupedComboboxOption[] }[] = [];
  for (const opt of filtered) {
    let g = groups.find((g) => g.label === opt.group);
    if (!g) {
      g = { label: opt.group, options: [] };
      groups.push(g);
    }
    g.options.push(opt);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="input flex w-full items-center justify-between text-left disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
      >
        <span className={selected ? "text-ink-800" : "text-gray-400"}>{selected ? selected.label : placeholder}</span>
        {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>

      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
          <div className="relative border-b border-gray-100 p-2">
            <Search size={14} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="input pl-8"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {groups.length === 0 ? (
              <p className="px-3 py-3 text-center text-xs font-medium tracking-wide text-gray-400">NO RESULTS FOUND</p>
            ) : (
              groups.map((g) => (
                <div key={g.label}>
                  <div className="bg-gray-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    {g.label}
                  </div>
                  {g.options.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => {
                        onChange(o.value);
                        setQuery("");
                        setOpen(false);
                      }}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                        o.value === value ? "bg-brand-50 text-brand-700" : "text-ink-800"
                      }`}
                    >
                      <span>{o.label}</span>
                      {o.value === value && <Check size={14} className="shrink-0 text-brand-600" />}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
