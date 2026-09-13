import "server-only";

import { requireSession } from "@/lib/auth/session";
import { assertEditableDemoAccountMutable } from "./identity";

export async function requireMutableAccountSession() {
  const session = await requireSession();
  await assertEditableDemoAccountMutable(session.user.id);
  return session;
}
