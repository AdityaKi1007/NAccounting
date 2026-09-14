"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Moon, Sun } from "lucide-react";
import { ACCENT_PRESETS, isValidHex } from "@/lib/theme";

interface Org {
  id: string;
  accent_color: string;
  accent_custom_hex: string | null;
  theme_preference: string;
}

const PRESET_KEYS = Object.keys(ACCENT_PRESETS);

export default function BrandingForm({ organization }: { organization: Org }) {
  const router = useRouter();
  const o = organization;

  const [accentColor, setAccentColor] = useState(o.accent_color);
  const [customHex, setCustomHex] = useState(o.accent_custom_hex ?? "#4f46e5");
  const [themePreference, setThemePreference] = useState(o.theme_preference);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    setSaving(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/settings/branding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accent_color: accentColor,
        accent_custom_hex: customHex,
        theme_preference: themePreference,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Could not save changes.");
      return;
    }
    setMessage("Saved. Reloading to apply your new brand color...");
    setTimeout(() => router.refresh(), 400);
  }

  return (
    <div className="max-w-3xl space-y-6">
      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>}

      <div className="card space-y-4 p-6">
        <h2 className="text-sm font-semibold text-ink-800">Organization Logo</h2>
        <p className="text-xs text-gray-500">
          Manage your organization&apos;s logo from{" "}
          <Link href="/settings/company/profile" className="text-brand-600 hover:underline">
            Company Profile
          </Link>{" "}
          — it&apos;s shown there alongside your other company details, and appears in transaction PDFs and email
          notifications.
        </p>
      </div>

      <div className="card space-y-4 p-6">
        <h2 className="text-sm font-semibold text-ink-800">Appearance</h2>
        <p className="text-xs text-gray-500">
          Choose how NeoAccounting looks for everyone in this organization.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          {[
            { value: "light", label: "Light", icon: Sun },
            { value: "dark", label: "Dark", icon: Moon },
          ].map((opt) => {
            const Icon = opt.icon;
            const selected = themePreference === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setThemePreference(opt.value)}
                className={`flex flex-col items-center gap-2 rounded-md border p-4 text-sm ${
                  selected ? "border-brand-600 ring-1 ring-brand-600" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <Icon size={18} className={selected ? "text-brand-600" : "text-gray-400"} />
                {opt.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-gray-400">
          Dark mode is saved with your preference but the interface itself doesn&apos;t repaint yet in this build.
        </p>
      </div>

      <div className="card space-y-4 p-6">
        <h2 className="text-sm font-semibold text-ink-800">Brand Color</h2>
        <p className="text-xs text-gray-500">Used for buttons, links and highlights across the app.</p>
        <div className="flex flex-wrap items-center gap-3">
          {PRESET_KEYS.map((key) => {
            const preset = ACCENT_PRESETS[key];
            const selected = accentColor === key;
            return (
              <button
                key={key}
                type="button"
                title={preset.label}
                onClick={() => setAccentColor(key)}
                className="flex h-10 w-10 items-center justify-center rounded-full border-2"
                style={{ backgroundColor: preset.hex, borderColor: selected ? "#111827" : "transparent" }}
              >
                {selected && <Check size={16} className="text-white" />}
              </button>
            );
          })}
          <button
            type="button"
            title="Custom"
            onClick={() => setAccentColor("custom")}
            className="flex h-10 w-10 items-center justify-center rounded-full border-2 bg-[conic-gradient(from_0deg,red,yellow,lime,cyan,blue,magenta,red)]"
            style={{ borderColor: accentColor === "custom" ? "#111827" : "transparent" }}
          >
            {accentColor === "custom" && <Check size={16} className="text-white drop-shadow" />}
          </button>
          {accentColor === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={isValidHex(customHex) ? customHex : "#4f46e5"}
                onChange={(e) => setCustomHex(e.target.value)}
                className="h-10 w-10 cursor-pointer rounded border border-gray-200 p-0.5"
              />
              <input
                className="input w-28"
                value={customHex}
                onChange={(e) => setCustomHex(e.target.value)}
                placeholder="#4f46e5"
              />
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <button onClick={onSave} disabled={saving} className="btn-primary">
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
