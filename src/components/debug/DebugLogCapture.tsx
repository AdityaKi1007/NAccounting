"use client";

import { useEffect } from "react";
import { reportClientException } from "@/components/debug/report-client-exception";

/** Mounted once in the authenticated app shell (see (app)/layout.tsx) — catches every
 * uncaught browser-side JS error and unhandled promise rejection app-wide, independent of
 * which page or component it came from. Paired with DebugErrorBoundary.tsx, which catches the
 * one big category window.onerror/unhandledrejection can't: a React component throwing during
 * render. Renders nothing; this is a pure side-effect component. */
export default function DebugLogCapture() {
  useEffect(() => {
    function onError(event: ErrorEvent) {
      reportClientException({
        message: event.message || event.error?.message || "Uncaught error",
        stack: event.error?.stack ?? null,
      });
    }
    function onUnhandledRejection(event: PromiseRejectionEvent) {
      const reason = event.reason;
      reportClientException({
        message: reason instanceof Error ? reason.message : String(reason ?? "Unhandled promise rejection"),
        stack: reason instanceof Error ? (reason.stack ?? null) : null,
      });
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}
