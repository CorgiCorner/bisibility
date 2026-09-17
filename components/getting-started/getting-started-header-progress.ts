import type { resolveSetupProgress } from "@/lib/getting-started/setup-steps";
export type ResolvedSetupProgress = ReturnType<typeof resolveSetupProgress>;
export type CompletionAcknowledgementMode = "state-a" | "state-b";

/**
 * What the header island is allowed to receive. A resolved step carries its definition, and a
 * definition carries `resolve(ctx)` and a video reference, so the full progress object cannot
 * cross the RSC boundary into a client component.
 */
export type SetupProgressSummary = Readonly<{
  completed: boolean;
  settledCount: number;
  totalCount: number;
}>;

export function setupProgressSummary(progress: ResolvedSetupProgress): SetupProgressSummary {
  return {
    completed: progress.completed,
    settledCount: progress.settledCount,
    totalCount: progress.totalCount,
  };
}

export type GettingStartedHeaderProgressModel = Readonly<{
  completed: boolean;
  settledCount: number;
  totalCount: number;
}>;

export function gettingStartedHeaderProgressModel(
  progress: SetupProgressSummary,
  _completionMode: CompletionAcknowledgementMode,
): GettingStartedHeaderProgressModel {
  return {
    completed: progress.completed,
    settledCount: progress.settledCount,
    totalCount: progress.totalCount,
  };
}
