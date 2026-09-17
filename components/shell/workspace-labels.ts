import type { WorkspaceDataState } from "@/lib/queries/workspace-state";

// Phosphor-free workspace text/status helpers, so SERVER components can import these
// without pulling @phosphor-icons/react into the RSC bundle (it calls createContext at
// module eval, which is unavailable in Server Components).

export const PROJECT_NAME_MAX_CHARS = 14;

export function truncateProjectName(name: string, maxChars = PROJECT_NAME_MAX_CHARS): string {
  if (name.length <= maxChars) return name;
  return `${name.slice(0, maxChars)}…`;
}

export type WorkspaceDisplayFacts = {
  keywordCount: number;
  latestCompletedRankCheckAt?: Date | null;
  state?: WorkspaceDataState;
};

export type WorkspaceLabelFormatter = {
  keywordCount: (count: number) => string;
  newProject: () => string;
  noData: (count: number) => string;
};

function workspaceState({ keywordCount, state }: WorkspaceDisplayFacts): WorkspaceDataState {
  if (state) {
    return state;
  }
  return keywordCount === 0 ? "empty" : "populated";
}

/** Switcher sublabel shared by the trigger and dropdown rows. */
export function workspaceSublabel(
  workspace: WorkspaceDisplayFacts,
  labels: WorkspaceLabelFormatter,
): string {
  const state = workspaceState(workspace);
  if (state === "empty") {
    return labels.newProject();
  }
  if (state === "no-data") {
    return labels.noData(workspace.keywordCount);
  }
  return labels.keywordCount(workspace.keywordCount);
}

/** Dropdown-row meta mirrors the active trigger sublabel. */
export function workspaceRowMeta(
  workspace: WorkspaceDisplayFacts,
  labels: WorkspaceLabelFormatter,
): string {
  return workspaceSublabel(workspace, labels);
}
