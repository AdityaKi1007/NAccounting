import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";

/**
 * Platform-level check — deliberately independent of org membership/role, since a Super
 * Admin (today: only aditya.kishor@gmail.com, per users.is_super_admin) needs to manage
 * every organization regardless of which org they're currently "in".
 */
export async function requireSuperAdminPage(): Promise<{ userId: string }> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.isSuperAdmin) notFound();
  return { userId: session.user.id };
}

/** API-route variant: returns null (caller responds 404, matching the page's notFound()) instead of throwing. */
export async function getSuperAdminApiContext(): Promise<{ userId: string } | null> {
  const session = await auth();
  if (!session?.user || !session.isSuperAdmin) return null;
  return { userId: session.user.id };
}
