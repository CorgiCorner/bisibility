import "server-only";

import type { AuthSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { deploymentMode } from "@/lib/deployment/deployment";

export class AdminTwoFactorRequiredError extends Error {
  readonly code = "two_factor_required";

  constructor(readonly action: string) {
    super("Enable two-factor authentication before performing this action.");
    this.name = "AdminTwoFactorRequiredError";
  }
}

export function adminRequiresTwoFactor() {
  return deploymentMode() === "cloud" || process.env.ADMIN_REQUIRE_TWO_FACTOR !== "false";
}

/** UI projection only. Mutations must call the guard again after checking the admin role. */
export async function adminDangerousActionAllowed(session: Pick<AuthSession, "user">) {
  if (!adminRequiresTwoFactor()) return true;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { twoFactorEnabled: true },
  });
  return user?.twoFactorEnabled === true;
}

export async function requireAdminTwoFactorForDangerousAction(
  session: Pick<AuthSession, "user">,
  action: string,
) {
  if (!(await adminDangerousActionAllowed(session))) {
    throw new AdminTwoFactorRequiredError(action);
  }
}
