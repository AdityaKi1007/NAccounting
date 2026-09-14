"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Bell, Settings, ChevronDown, Plus, LogOut, Building2, Check, X, Settings2, ShieldCheck } from "lucide-react";
import { orgDisplayId } from "@/lib/format";
import GlobalSearch from "@/components/GlobalSearch";

export default function Topbar({ orgName }: { orgName: string }) {
  const router = useRouter();
  const { data: session, update } = useSession();
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const orgMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const memberships = session?.memberships ?? [];
  const activeOrgId = session?.activeOrgId;

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (orgMenuRef.current && !orgMenuRef.current.contains(e.target as Node)) setOrgMenuOpen(false);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  async function switchOrg(organizationId: string) {
    if (organizationId === activeOrgId) {
      setOrgMenuOpen(false);
      return;
    }
    await update({ activeOrgId: organizationId });
    setOrgMenuOpen(false);
    router.push("/");
    router.refresh();
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-gray-200 bg-ink-900 px-4">
      <div className="flex items-center gap-2 pr-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-600 text-sm font-bold text-white">
          N
        </div>
        <span className="text-[15px] font-semibold text-white">NeoAccounting</span>
      </div>

      <GlobalSearch />

      <div className="flex-1" />

      <button type="button" className="rounded-md p-1.5 text-gray-300 hover:bg-white/10 hover:text-white">
        <Plus size={18} />
      </button>
      <button type="button" className="rounded-md p-1.5 text-gray-300 hover:bg-white/10 hover:text-white">
        <Bell size={18} />
      </button>
      <Link href="/settings" className="rounded-md p-1.5 text-gray-300 hover:bg-white/10 hover:text-white">
        <Settings size={18} />
      </Link>

      <div className="relative" ref={orgMenuRef}>
        <button
          type="button"
          onClick={() => setOrgMenuOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-gray-100 hover:bg-white/10"
        >
          <Building2 size={15} />
          <span className="max-w-[9rem] truncate">{orgName}</span>
          <ChevronDown size={14} />
        </button>
        {orgMenuOpen && (
          <div className="absolute right-0 z-20 mt-1 w-80 rounded-lg border border-gray-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-ink-800">Organizations</h3>
              <div className="flex items-center gap-3">
                <Link
                  href="/organizations"
                  onClick={() => setOrgMenuOpen(false)}
                  className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                >
                  <Settings2 size={13} />
                  Manage
                </Link>
                <button
                  type="button"
                  onClick={() => setOrgMenuOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={15} />
                </button>
              </div>
            </div>
            <div className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
              My Organizations
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {memberships.map((m) => (
                <button
                  key={m.organizationId}
                  onClick={() => switchOrg(m.organizationId)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-400">
                    <Building2 size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-800">{m.organizationName}</p>
                    <p className="truncate text-xs text-gray-400">
                      Organization ID: {orgDisplayId(m.orgSeq)} <span className="mx-1">&middot;</span> Premium Trial
                    </p>
                  </div>
                  {m.organizationId === activeOrgId && (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
                      <Check size={12} />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="relative" ref={userMenuRef}>
        <button
          type="button"
          onClick={() => setUserMenuOpen((v) => !v)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white"
        >
          {(session?.user?.name ?? "?").charAt(0).toUpperCase()}
        </button>
        {userMenuOpen && (
          <div className="absolute right-0 z-20 mt-1 w-56 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
            <div className="border-b border-gray-100 px-3 py-2">
              <p className="truncate text-sm font-medium text-ink-800">{session?.user?.name}</p>
              <p className="truncate text-xs text-gray-500">{session?.user?.email}</p>
            </div>
            {session?.isSuperAdmin && (
              <Link
                href="/super-admin"
                onClick={() => setUserMenuOpen(false)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-700 hover:bg-gray-50"
              >
                <ShieldCheck size={15} />
                Super Admin
              </Link>
            )}
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
            >
              <LogOut size={15} />
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
