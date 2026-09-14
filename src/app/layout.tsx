import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  title: "NeoAccounting",
  description: "Multi-tenant accounting software",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // en-GB (not plain "en") is what makes Chrome/Edge's native <input type="date"> pickers
    // display DD/MM/YYYY instead of the ambiguous "en" locale falling back to the OS's own
    // setting — requested as "date format should be DD/MM/YYYY everywhere". This only changes
    // the VISUAL text shown in the date box; the underlying value a date input holds and
    // submits is always the ISO YYYY-MM-DD string regardless of locale, so no form/API code
    // needed to change alongside this. See src/lib/format.ts's formatDate/formatDateTime for
    // the matching change to every other (non-input) displayed date in the app.
    <html lang="en-GB">
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
