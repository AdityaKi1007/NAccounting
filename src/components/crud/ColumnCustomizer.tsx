"use client";

import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal, Check } from "lucide-react";
import Modal from "@/components/ui/Modal";

export interface ColumnOption {
  name: string;
  label: string;
}

// The small "list view options" icon Zoho shows at the top-left of every table (gear/sliders
// icon → dropdown with "Customize Columns" and "Clip Text"). Lives in DataTable.tsx, which
// owns the actual column-filtering/clip-text state (persisted per entity via localStorage —
// see DataTable's own comment) — this component is purely the icon + dropdown + modal chrome.
export default function ColumnCustomizer({
  options,
  visible,
  onChangeVisible,
  clipText,
  onChangeClipText,
}: {
  /** Every column this list COULD show, in display order. */
  options: ColumnOption[];
  /** Currently visible column names, in display order. */
  visible: string[];
  onChangeVisible: (columns: string[]) => void;
  clipText: boolean;
  onChangeClipText: (value: boolean) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [pending, setPending] = useState<string[]>(visible);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  function openCustomize() {
    setPending(visible);
    setModalOpen(true);
    setMenuOpen(false);
  }

  function toggle(name: string) {
    setPending((prev) => (prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]));
  }

  function save() {
    // Keep the options' own display order rather than the order checkboxes were clicked in.
    // Refuse to save down to zero visible columns — silently keep whatever was showing
    // before instead of leaving the table with nothing to render.
    const ordered = options.filter((o) => pending.includes(o.name)).map((o) => o.name);
    onChangeVisible(ordered.length > 0 ? ordered : visible);
    setModalOpen(false);
  }

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title="List view options"
          aria-label="List view options"
        >
          <SlidersHorizontal size={15} />
        </button>
        {menuOpen && (
          <div className="absolute left-0 z-20 mt-1 w-52 rounded-lg border border-gray-200 bg-white py-1 shadow-xl">
            <button
              type="button"
              onClick={openCustomize}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-700 hover:bg-gray-50"
            >
              Customize Columns
            </button>
            <button
              type="button"
              onClick={() => {
                onChangeClipText(!clipText);
                setMenuOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-ink-700 hover:bg-gray-50"
            >
              Clip Text
              {clipText && <Check size={14} className="text-brand-600" />}
            </button>
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Customize Columns" width="max-w-sm">
        <p className="mb-3 text-xs text-gray-500">Choose which columns to show in this list.</p>
        <div className="max-h-72 space-y-0.5 overflow-y-auto">
          {options.map((opt) => (
            <label
              key={opt.name}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink-700 hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={pending.includes(opt.name)}
                onChange={() => toggle(opt.name)}
                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              {opt.label}
            </label>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
          <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">
            Cancel
          </button>
          <button type="button" onClick={save} className="btn-primary">
            Save
          </button>
        </div>
      </Modal>
    </>
  );
}
