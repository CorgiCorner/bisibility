export type WorkspaceDataState = "empty" | "no-data" | "populated";

export type WorkspaceStateFacts = Partial<{
  addedThisMonth: number;
  checksThisMonth: number;
  estimatedProviderCost: string;
  hasEverChecked: boolean;
  lastCheckAt: Date | null;
  lastCheckEverAt: Date | null;
  nextCheckAt: Date | null;
  projectReadOnly: boolean;
  providerConnected: boolean;
  state: WorkspaceDataState;
  trackedKeywordCount: number;
}>;

type WorkspaceStateInput = {
  hasCompletedCheck?: boolean;
  hasEverChecked?: boolean;
  keywordCount: number;
};

export function deriveWorkspaceState({
  hasCompletedCheck,
  hasEverChecked,
  keywordCount,
}: WorkspaceStateInput): WorkspaceDataState {
  if (keywordCount === 0) {
    return "empty";
  }

  return (hasEverChecked ?? hasCompletedCheck ?? false) ? "populated" : "no-data";
}
