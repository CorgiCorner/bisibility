import { isProjectReadOnly, ProjectReadOnlyError } from "@/lib/deployment/project-write-mode";
import { redactOpsText } from "@/lib/ops/redact-text";
import { ProviderRateLimitedError } from "@/lib/providers/rate-limit";
import { isBudgetExhaustedError } from "@/lib/rank-check/budget";
import { RankCheckRunnerError } from "@/lib/rank-check/runner";

export type FirstCheckCandidate = {
  device: "desktop" | "mobile";
  id: string;
  market: {
    languageLabel: string;
    locationLabel: string;
  };
  publicId: string;
  text: string;
};

export type ListFirstCheckCandidatesResult = {
  candidates: FirstCheckCandidate[];
  hasAnalyticsSource: boolean;
  isSampleProject: boolean;
  providerReady: boolean;
};

export type FirstCheckRunPlan = {
  budget: { capCents: number; spentCents: number };
  estimatedCostPerCheckCents: number | null;
  readyCount: number;
  providers: string[];
  scope: { depth: string; device: string; engine: string; frequency: string; location: string };
  providerReady: boolean;
  isSampleProject: boolean;
  budgetExhausted: boolean;
};

export type ObservedPosition = {
  clicks: number;
  impressions: number;
  keywordId: string;
  position: number;
  text: string;
};

export type FirstCheckPreviewFailureCode =
  | "budget_exhausted"
  | "failed"
  | "no_provider"
  | "project_read_only"
  | "rate_limited"
  | "sample_project"
  | "unexpected";

export type RunFirstCheckPreviewResult =
  | {
      position: number | null;
      provider: string;
      rankingUrl: string | null;
      status: "completed";
    }
  | {
      code: FirstCheckPreviewFailureCode;
      message: string;
      status: "failed";
    };

export function previewFailure(
  code: FirstCheckPreviewFailureCode,
  message: string,
): RunFirstCheckPreviewResult {
  return { code, message, status: "failed" };
}

export function isProjectReadOnlyError(error: unknown) {
  const value = error as { code?: unknown; name?: unknown; project?: { writeMode?: unknown } };
  return (
    error instanceof ProjectReadOnlyError ||
    value.code === "project_read_only" ||
    value.name === "ProjectReadOnlyError" ||
    isProjectReadOnly(value.project?.writeMode)
  );
}

export function expectedPreviewFailure(error: unknown): RunFirstCheckPreviewResult | null {
  if (isProjectReadOnlyError(error)) {
    return previewFailure("project_read_only", "This project is read-only right now.");
  }
  if (isBudgetExhaustedError(error)) {
    return previewFailure("budget_exhausted", "Monthly rank-check budget reached.");
  }
  if (
    error instanceof ProviderRateLimitedError ||
    (error instanceof RankCheckRunnerError && error.code === "provider_rate_limited")
  ) {
    return previewFailure("rate_limited", "Provider rate limit reached. Try again shortly.");
  }
  if (error instanceof RankCheckRunnerError && error.code === "no_provider_connected") {
    return previewFailure("no_provider", "Connect a SERP provider before running checks.");
  }
  if (error instanceof RankCheckRunnerError) {
    return previewFailure("failed", "We couldn't run this check. Try again in a moment.");
  }
  return null;
}

export function unexpectedPreviewFailure(
  error: unknown,
  context: { keywordId: string; projectId: string },
): RunFirstCheckPreviewResult {
  console.error("[rank-check-preview] unexpected failure", {
    error: redactOpsText(error instanceof Error ? (error.stack ?? error.message) : error, 2_000),
    keywordId: context.keywordId,
    projectId: context.projectId,
  });
  return previewFailure("unexpected", "Check failed on our side. Retry in a moment.");
}
