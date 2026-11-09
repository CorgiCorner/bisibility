import "server-only";
import { AuthorizationError } from "@/lib/auth/authorize";
import { getInstanceAdminSession } from "@/lib/auth/instance-admin";
import { getSession } from "@/lib/auth/session";

/** Absence is renderable; an authenticated non-administrator is forbidden. */
export async function ossAdminSession() {
  if (!(await getSession())) return null;
  const session = await getInstanceAdminSession();
  if (!session)
    throw new AuthorizationError("forbidden", "Instance administrator access required.");
  return session;
}
