import "server-only";

import { createHash } from "node:crypto";
import { consume } from "@/lib/api/ratelimit";
import {
  TWO_FACTOR_STEP_UP_ATTEMPT_LIMIT,
  TWO_FACTOR_STEP_UP_WINDOW_SECONDS,
} from "@/lib/auth/two-factor-policy";

export class AdminActionRateLimitError extends Error {
  readonly code = "rate_limited";
}

/** Retain the shared mail/account mutation budget previously charged by code confirmation. */
export async function consumeAdminActionBudget(actorId: string) {
  const budget = await consume({
    bucketKey: createHash("sha256").update(actorId).digest("hex"),
    limit: TWO_FACTOR_STEP_UP_ATTEMPT_LIMIT,
    prefix: "bisibility:two-factor:management",
    windowSeconds: TWO_FACTOR_STEP_UP_WINDOW_SECONDS,
  });
  if (!budget.success) throw new AdminActionRateLimitError("Try again later.");
}
