import type { resolveSetupProgress } from "@/lib/getting-started/setup-steps";
import { appPath, type ProjectRef } from "@/lib/routing/app-path";

export type ResolvedSetupProgress = ReturnType<typeof resolveSetupProgress>;
export type CompletionAcknowledgementMode = "state-a" | "state-b";

export type GettingStartedHeaderProgressModel = Readonly<{
  completed: boolean;
  countLabel: string;
  dashboardHref: string | null;
  dashboardVisibility: "hidden" | "visible" | null;
  showCheck: boolean;
}>;

export function gettingStartedHeaderProgressModel(
  progress: ResolvedSetupProgress,
  projectRef: ProjectRef,
  completionMode: CompletionAcknowledgementMode,
): GettingStartedHeaderProgressModel {
  const completed = progress.doneCount === progress.totalCount;
  return {
    completed,
    countLabel: `${progress.doneCount} / ${progress.totalCount} steps`,
    dashboardHref: completed ? appPath(projectRef, "dashboard") : null,
    dashboardVisibility: completed ? (completionMode === "state-b" ? "visible" : "hidden") : null,
    showCheck: completed && completionMode === "state-b",
  };
}
