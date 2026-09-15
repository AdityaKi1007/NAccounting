"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { reportClientException } from "@/components/debug/report-client-exception";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/** Mounted once in the authenticated app shell (see (app)/layout.tsx), wrapping {children} —
 * catches the one category of client-side exception window.onerror/unhandledrejection can't:
 * a React component throwing during render. Paired with DebugLogCapture.tsx, which handles
 * everything else browser-side (plain JS errors, unhandled promise rejections). Together these
 * two give genuinely comprehensive client-side coverage — see the Debug Logs addendum doc for
 * the full scope disclosure, including what is and isn't covered server-side.
 *
 * Deliberately a small, deep boundary at the app-shell root rather than one per page/section:
 * simpler to reason about, and a crash still shows the persistent Topbar/Sidebar chrome around
 * the fallback (this is nested inside AppLayout, below Topbar/Sidebar — see layout.tsx) so the
 * user can still navigate away instead of being stuck on a fully blank page. */
export default class DebugErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportClientException({
      message: error.message || "Unhandled render error",
      stack: error.stack ?? null,
      componentStack: info.componentStack ?? null,
    });
  }

  handleReload = () => {
    this.setState({ hasError: false });
    if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
          <AlertTriangle size={40} className="text-amber-500" />
          <h2 className="text-base font-semibold text-ink-800">Something went wrong</h2>
          <p className="max-w-sm text-sm text-gray-500">
            This page ran into an unexpected error. It&apos;s been noted — try reloading the page.
          </p>
          <button type="button" onClick={this.handleReload} className="btn-primary mt-1 px-4 py-2 text-sm">
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
