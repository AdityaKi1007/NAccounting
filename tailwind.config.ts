import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Values come from CSS custom properties (set per-tenant in the (app) layout from
        // the saved accent color, with fallbacks below matching the original blue) so the
        // Branding settings page can recolor the whole app without a Tailwind rebuild.
        brand: {
          50: "var(--brand-50, #eef2ff)",
          100: "var(--brand-100, #e0e7ff)",
          200: "var(--brand-200, #c7d2fe)",
          300: "var(--brand-300, #a5b4fc)",
          400: "var(--brand-400, #818cf8)",
          500: "var(--brand-500, #6366f1)",
          600: "var(--brand-600, #4f46e5)",
          700: "var(--brand-700, #4338ca)",
          800: "var(--brand-800, #3730a3)",
          900: "var(--brand-900, #312e81)",
        },
        ink: {
          900: "#0b1220",
          800: "#141b2d",
          700: "#1c2438",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
