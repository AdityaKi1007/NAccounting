"use client";

import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

export default function PendingApprovalActions({
  otherApproved,
}: {
  otherApproved: { organizationId: string; organizationName: string }[];
}) {
  const router = useRouter();
  const { update } = useSession();

  async function switchOrg(organizationId: string) {
    await update({ activeOrgId: organizationId });
    router.push("/");
    router.refresh();
  }

  return (
    <>
      {otherApproved.length > 0 && (
        <div className="border-t border-gray-200 pt-4">
          <p className="mb-2 text-sm font-medium text-ink-700">Switch to another organization</p>
          <div className="space-y-1.5">
            {otherApproved.map((m) => (
              <button
                key={m.organizationId}
                type="button"
                onClick={() => switchOrg(m.organizationId)}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-left text-sm text-ink-700 hover:bg-gray-50"
              >
                {m.organizationName}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="border-t border-gray-200 pt-4">
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-sm font-medium text-gray-500 hover:text-ink-700"
        >
          Sign out
        </button>
      </div>
    </>
  );
}
