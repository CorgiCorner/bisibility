import "server-only";

import { revokeOtherSessions } from "@/lib/auth/session-revocation";
import { assertDemoAccountMutable } from "@/lib/demo/config";

/** Better Auth hands the hook the whole update payload; only `email` matters here. */
type UserUpdateInput = Record<string, unknown>;

type EndpointSession = {
  session: { id: string };
  user: { email: string; id: string };
};

type HookContext = { context: { session?: EndpointSession | null } };

/**
 * Better Auth `user.update.before` hook. For the change-email endpoint it runs after the
 * code sent to the new address has been verified and consumed, and before the new address is
 * written. A wrong or expired code never touches other sessions; if the email update fails after
 * this hook, other sessions remain revoked while the address is unchanged and the code is consumed.
 */
export async function revokeOtherSessionsBeforeEmailChange(
  data: UserUpdateInput,
  context: HookContext | null,
) {
  if (typeof data.email !== "string") return;
  assertDemoAccountMutable();
  const current = context?.context.session;
  if (!current) return;
  if (current.user.email.toLowerCase() === data.email.toLowerCase()) return;

  await revokeOtherSessions(current);
}
