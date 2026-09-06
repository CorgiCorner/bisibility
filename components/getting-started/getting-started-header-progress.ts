import type { resolveSetupProgress } from "@/lib/getting-started/setup-steps";
import { formatSetupProgressLabel } from "./getting-started-copy";

export type ResolvedSetupProgress = ReturnType<typeof resolveSetupProgress>;
export type CompletionAcknowledgementMode = "state-a" | "state-b";

export type GettingStartedHeaderProgressModel = Readonly<{
  completed: boolean;
  countLabel: string;
}>;

export function gettingStartedHeaderProgressModel(
  progress: ResolvedSetupProgress,
  _completionMode: CompletionAcknowledgementMode,
): GettingStartedHeaderProgressModel {
  return {
    completed: progress.completed,
    countLabel: formatSetupProgressLabel(progress.settledCount, progress.totalCount),
  };
}
