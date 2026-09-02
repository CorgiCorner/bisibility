import type { resolveSetupProgress } from "@/lib/getting-started/setup-steps";
import { formatSetupProgressLabel } from "./getting-started-copy";

export type ResolvedSetupProgress = ReturnType<typeof resolveSetupProgress>;
export type CompletionAcknowledgementMode = "state-a" | "state-b";

export type GettingStartedHeaderProgressModel = Readonly<{
  completed: boolean;
  countLabel: string;
  showCheck: boolean;
}>;

export function gettingStartedHeaderProgressModel(
  progress: ResolvedSetupProgress,
  completionMode: CompletionAcknowledgementMode,
): GettingStartedHeaderProgressModel {
  const completed = progress.completed;
  return {
    completed,
    countLabel: formatSetupProgressLabel(progress.settledCount, progress.totalCount),
    showCheck: completed && completionMode === "state-b",
  };
}
