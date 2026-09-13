"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import type { SearchResultGroup } from "@/lib/search";

// The Topbar's global search box. Previously this was a bare, uncontrolled <input> — no state,
// no keyboard shortcut, no fetch, no backend — just a styled placeholder ("Search in
// Customers ( / )") left over from scaffolding. This is the real implementation: debounced
// fetch to /api/search, a results dropdown grouped by entity type (Customers, Vendors,
// Invoices, Sales Orders, Payments Received, ...), the "/" shortcut to focus it from anywhere,
// and arrow-key navigation.
export default function GlobalSearch() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<SearchResultGroup[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [searchedFor, setSearchedFor] = useState<string | null>(null);

  // Flatten groups into one ordered list so ArrowUp/ArrowDown/Enter can move across group
  // boundaries without each group needing its own index namespace.
  const flatItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  // Global "/" shortcut: focuses the box from anywhere in the app, unless the user is already
  // typing into another field (an input/textarea/select or a contentEditable element) — matches
  // the convention used by GitHub/Linear/Slack so "/" never steals a keystroke meant elsewhere.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "/") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isEditable =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable;
      if (isEditable) return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = value.trim();
    if (q.length < 2) {
      setGroups([]);
      setLoading(false);
      setSearchedFor(null);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const requestId = ++requestIdRef.current;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        // Ignore a stale response that resolved after a newer keystroke's request.
        if (requestId !== requestIdRef.current) return;
        setGroups(res.ok ? (data.groups ?? []) : []);
        setSearchedFor(q);
        setActiveIndex(0);
      } catch {
        if (requestId !== requestIdRef.current) return;
        setGroups([]);
        setSearchedFor(q);
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  function goTo(href: string) {
    setOpen(false);
    setValue("");
    setGroups([]);
    setSearchedFor(null);
    inputRef.current?.blur();
    router.push(href);
  }

  function onKeyDownInput(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!open || flatItems.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % flatItems.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + flatItems.length) % flatItems.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = flatItems[activeIndex];
      if (item) goTo(item.href);
    }
  }

  const showDropdown = open && value.trim().length >= 2;
  let runningIndex = -1;

  return (
    <div ref={containerRef} className="relative w-72 max-w-sm flex-1">
      {loading ? (
        <Loader2 className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 animate-spin text-gray-400" size={15} />
      ) : (
        <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
      )}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDownInput}
        className="w-full rounded-md border-none bg-white/10 py-1.5 pl-8 pr-3 text-sm text-white placeholder:text-gray-400 focus:bg-white focus:text-ink-800 focus:outline-none"
        placeholder="Search customers, invoices, vendors... ( / )"
        autoComplete="off"
      />

      {showDropdown && (
        <div className="absolute left-0 top-full z-30 mt-1 max-h-96 w-96 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1.5 text-ink-800 shadow-xl">
          {loading && groups.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400">Searching…</p>
          ) : groups.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400">
              {searchedFor ? `No results for "${searchedFor}"` : "Type at least 2 characters to search"}
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.key} className="py-1">
                <p className="px-4 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  {group.label}
                </p>
                {group.items.map((item) => {
                  runningIndex += 1;
                  const isActive = runningIndex === activeIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onMouseEnter={() => setActiveIndex(runningIndex)}
                      onClick={() => goTo(item.href)}
                      className={`flex w-full flex-col items-start gap-0.5 px-4 py-1.5 text-left ${
                        isActive ? "bg-brand-50" : "hover:bg-gray-50"
                      }`}
                    >
                      <span className="text-sm font-medium text-ink-800">{item.title}</span>
                      <span className="truncate text-xs text-gray-500">{item.subtitle}</span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
