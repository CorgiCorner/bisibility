import "server-only";

import { requireSession } from "@/lib/auth/session";
import { assertDemoAccountMutable } from "./config";

export async function requireMutableAccountSession() {
  const session = await requireSession();
  assertDemoAccountMutable();
  return session;
}
