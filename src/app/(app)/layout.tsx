import { requireActiveContext } from "@/lib/session";
import { queryOne } from "@/lib/db";
import { getVisibleModuleKeys } from "@/lib/module-access";
import { resolveAccentBase, rampCssVars } from "@/lib/theme";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import DebugLogCapture from "@/components/debug/DebugLogCapture";
import DebugErrorBoundary from "@/components/debug/DebugErrorBoundary";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireActiveContext();

  const branding = await queryOne<{ accent_color: string; accent_custom_hex: string | null }>(
    `SELECT accent_color, accent_custom_hex FROM organizations WHERE id = $1`,
    [ctx.orgId]
  );
  const accentBase = resolveAccentBase(branding?.accent_color ?? "blue", branding?.accent_custom_hex ?? null);
  const visibleModuleKeys = Array.from(await getVisibleModuleKeys(ctx));

  return (
    <div className="flex h-screen flex-col">
      <style>{`:root { ${rampCssVars(accentBase)} }`}</style>
      {/* Window-level listeners (plain JS errors + unhandled promise rejections) — global,
          renders nothing. Paired with DebugErrorBoundary below for React render crashes. Both
          report through the same client route; capture is a no-op server-side unless this org
          has turned Debug Logs on (Settings > Debug Logs). */}
      <DebugLogCapture />
      <Topbar orgName={ctx.orgName} />
      <div className="flex min-h-0 flex-1">
        <Sidebar visibleModuleKeys={visibleModuleKeys} />
        <main className="min-w-0 flex-1 overflow-y-auto bg-[#f4f5f9]">
          <DebugErrorBoundary>{children}</DebugErrorBoundary>
        </main>
      </div>
    </div>
  );
}
