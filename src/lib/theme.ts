// Turns one accent color into a full Tailwind-style 50-900 shade ramp, so the Branding
// settings page can recolor every "brand-*" class in the app (buttons, links, focus
// rings) from a single saved hex value, without needing a design system of pre-baked
// palettes for every color a tenant might pick.

export const ACCENT_PRESETS: Record<string, { label: string; hex: string }> = {
  blue: { label: "Blue", hex: "#4f46e5" },
  green: { label: "Green", hex: "#16a34a" },
  red: { label: "Red", hex: "#dc2626" },
  orange: { label: "Orange", hex: "#ea580c" },
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHex(r: number, g: number, b: number) {
  const toHex = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Blends `base` toward `target` by `weight` (0 = pure base, 1 = pure target). */
function mix(base: string, target: string, weight: number) {
  const [r1, g1, b1] = hexToRgb(base);
  const [r2, g2, b2] = hexToRgb(target);
  return rgbToHex(r1 + (r2 - r1) * weight, g1 + (g2 - g1) * weight, b1 + (b2 - b1) * weight);
}

const SHADE_WEIGHTS: Record<string, number> = {
  "50": -0.94,
  "100": -0.88,
  "200": -0.74,
  "300": -0.54,
  "400": -0.3,
  "500": -0.12,
  "600": 0,
  "700": 0.16,
  "800": 0.32,
  "900": 0.48,
};

/** Generates a 50-900 ramp around `baseHex` (which becomes shade 600, matching Tailwind's default indigo scale). */
export function generateRamp(baseHex: string): Record<string, string> {
  const ramp: Record<string, string> = {};
  for (const [shade, weight] of Object.entries(SHADE_WEIGHTS)) {
    ramp[shade] = weight < 0 ? mix(baseHex, "#ffffff", -weight) : mix(baseHex, "#000000", weight);
  }
  return ramp;
}

export function isValidHex(value: string) {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
}

export function resolveAccentBase(accentColor: string, customHex: string | null): string {
  if (accentColor === "custom" && customHex && isValidHex(customHex)) return customHex;
  return ACCENT_PRESETS[accentColor]?.hex ?? ACCENT_PRESETS.blue.hex;
}

/** CSS custom-property declarations for a `:root { ... }` block, e.g. "--brand-600: #4f46e5;". */
export function rampCssVars(baseHex: string): string {
  const ramp = generateRamp(baseHex);
  return Object.entries(ramp)
    .map(([shade, hex]) => `--brand-${shade}: ${hex};`)
    .join(" ");
}
