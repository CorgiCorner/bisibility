import { requireTrackedDomain } from "@/lib/projects/tracked-domain";
import {
  isUnrunnableReason,
  KEYWORD_ARCHIVED_REASON,
  MARKET_INACTIVE_REASON,
  type UnrunnableReason,
} from "@/lib/rank-check/runnable-reasons";
import { isSampleProject } from "@/lib/sample-data/marker";
import type { SerpDepth } from "@/lib/serp/markets";
import type { ParentRelation, RunStatus } from "./contract";
import type { RunSelectionSpec } from "./selection";

export type RankCheckRunProject = { domain: string | null; id: string; isSample: boolean };

export type RetryParentRun = {
  id: string;
  items: Array<{ id: string; keyword: { id: string; publicId: string }; status: string }>;
  project: RankCheckRunProject;
  publicId: string;
  status: string;
};

export type RetryLaunch = {
  parentRunId: string;
  parentRunPublicId: string;
  relation: Extract<ParentRelation, "retry_failed" | "retry_deferred">;
  sources: Map<string, string>;
};

export type LaunchRankCheckRunInput = {
  actorId: string | null;
  depth?: SerpDepth;
  idempotencyKey?: string;
  previewToken: string;
  project: RankCheckRunProject;
  providerId?: string;
  spec: RunSelectionSpec;
  trigger: "api" | "manual";
};

export type LaunchRankCheckRunCreatedResult = {
  estimatedCostCents: number;
  keywordCount: number;
  publicId: string;
  status: RunStatus;
  targetCount: number;
};

/** The one cause that clears itself: the work is already in flight and nobody has to act. */
export const ALREADY_IN_PROGRESS_REASON = "already_in_progress";

/**
 * Why a launch created nothing. Every other cause comes from the runnable predicate and needs an
 * operator to act, so the codes here are exactly the ones `runnable-reasons.ts` already puts on
 * cancelled items - one vocabulary from the claim loop through to the screen.
 */
export type LaunchRankCheckRunNothingToRunReason =
  | typeof ALREADY_IN_PROGRESS_REASON
  | UnrunnableReason;

const NOTHING_TO_RUN_MESSAGES = {
  already_in_progress: "All selected keywords already have rank checks in progress.",
  keyword_archived: "Every selected keyword has been archived.",
  market_inactive: "Every selected keyword is in a market that is not active.",
} as const satisfies Record<LaunchRankCheckRunNothingToRunReason, string>;

export type LaunchRankCheckRunNothingToRunResult = {
  message: string;
  outcome: "nothing_to_run";
  reason: LaunchRankCheckRunNothingToRunReason;
};

export type LaunchRankCheckRunResult =
  | LaunchRankCheckRunCreatedResult
  | LaunchRankCheckRunNothingToRunResult;

/** The reason is required: a caller that cannot name the cause must not guess one. */
export function launchRankCheckRunNothingToRun(
  reason: LaunchRankCheckRunNothingToRunReason,
): LaunchRankCheckRunNothingToRunResult {
  return { message: NOTHING_TO_RUN_MESSAGES[reason], outcome: "nothing_to_run", reason };
}

/**
 * The single cause to report for a selection where nothing was executable, given one predicate
 * verdict per blocked row.
 *
 * A `null` verdict is a row the predicate still admits, held back only by a check already in
 * flight, so it makes `already_in_progress` the honest answer for the selection. That is also the
 * answer for an empty selection, where there is no verdict to report at all. Only when the
 * predicate refused every blocked row does a predicate reason describe the selection as a whole,
 * and archival wins over market status there for the same reason `unrunnableClaimReason` prefers
 * it: the row itself is gone, which is the more specific fact to show an operator.
 */
export function launchNothingToRunReason(
  verdicts: ReadonlyArray<UnrunnableReason | null>,
): LaunchRankCheckRunNothingToRunReason {
  if (verdicts.length === 0 || verdicts.includes(null)) return ALREADY_IN_PROGRESS_REASON;
  return verdicts.includes(KEYWORD_ARCHIVED_REASON)
    ? KEYWORD_ARCHIVED_REASON
    : MARKET_INACTIVE_REASON;
}

/**
 * The nothing-to-run cause a preview exclusion names, or `null` when the exclusion names a cause
 * the launch reports some other way (`no_provider` throws, `paused` and `manual` never stop a
 * manual launch, `other_project` means the row was never in the selection).
 */
export function nothingToRunReasonFromExclusion(
  reason: string | null | undefined,
): LaunchRankCheckRunNothingToRunReason | null {
  if (isUnrunnableReason(reason)) return reason;
  return reason === "in_progress" ? ALREADY_IN_PROGRESS_REASON : null;
}

export function isLaunchRankCheckRunNothingToRun(
  result: LaunchRankCheckRunResult,
): result is LaunchRankCheckRunNothingToRunResult {
  return "outcome" in result && result.outcome === "nothing_to_run";
}

export type LaunchRankCheckRunErrorCode = "budget_exhausted" | "no_provider";

export class LaunchRankCheckRunError extends Error {
  constructor(readonly code: LaunchRankCheckRunErrorCode) {
    super(
      code === "budget_exhausted"
        ? "Rank check monthly budget reached."
        : "No connected rank data provider is available.",
    );
    this.name = "LaunchRankCheckRunError";
  }
}

const UNRUNNABLE_INLINE_MESSAGES = {
  keyword_archived: "The keyword was archived before this check could run.",
  market_inactive: "The market for this keyword is no longer active.",
} as const satisfies Record<UnrunnableReason, string>;

/**
 * Refusal of an inline check whose keyword the runnable predicate no longer admits. It lives here,
 * next to the launch refusals it is a sibling of, so the API error mappers can recognize it
 * without statically importing the inline executor - which both callers deliberately load through
 * a dynamic import so a deployment that never runs checks inline never pulls in Temporal.
 */
export class UnrunnableInlineRankCheckError extends Error {
  constructor(readonly reason: UnrunnableReason) {
    super(UNRUNNABLE_INLINE_MESSAGES[reason]);
    this.name = "UnrunnableInlineRankCheckError";
  }
}

export class SampleProjectError extends Error {
  readonly code = "sample_project";

  constructor() {
    super("Sample projects don't run real checks.");
    this.name = "SampleProjectError";
  }
}

export function requireRankCheckRunProject(project: RankCheckRunProject) {
  requireTrackedDomain(project);
  if (isSampleProject(project)) throw new SampleProjectError();
}
