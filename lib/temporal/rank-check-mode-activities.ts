import "server-only";

import {
  automaticProviderExecutionAllowed,
  rankCheckSchedulerMode,
} from "../rank-check/scheduler-mode";
import type {
  AuthorizeRankCheckExecutionInput,
  AuthorizeRankCheckExecutionResult,
} from "./rank-check-activity-contract";

export function authorizeRankCheckExecutionActivity(
  input: AuthorizeRankCheckExecutionInput,
): AuthorizeRankCheckExecutionResult {
  const mode = rankCheckSchedulerMode();
  const allowed =
    input.source === "manual" ||
    (input.source !== "ambiguous" && automaticProviderExecutionAllowed(mode, input.source));
  const reason = allowed
    ? null
    : input.source === "ambiguous"
      ? "ambiguous_automatic_source"
      : `automatic_${input.source}_disabled_in_${mode}`;
  return { allowed, mode, reason, source: input.source };
}
