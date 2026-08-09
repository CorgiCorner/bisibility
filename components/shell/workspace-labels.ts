import type { WorkspaceDataState } from "@/lib/queries/workspace-state";

// Phosphor-free workspace text/status helpers, so SERVER components can import these
// without pulling @phosphor-icons/react into the RSC bundle (it calls createContext at
// module eval, which is unavailable in Server Components).

const KEYWORD_FORMAT = new Intl.NumberFormat("en-US");

export type WorkspaceDisplayFacts = {
  keywordCount: number;
  latestCompletedRankCheckAt?: Date | null;
  state?: WorkspaceDataState;
};

function workspaceState({ keywordCount, state }: WorkspaceDisplayFacts): WorkspaceDataState {
  if (state) {
    return state;
  }
  return keywordCount === 0 ? "empty" : "populated";
}

function keywordLabel(keywordCount: number): string {
  const noun = keywordCount === 1 ? "keyword" : "keywords";
  return `${KEYWORD_FORMAT.format(keywordCount)} ${noun}`;
}

/** Switcher sublabel shared by the trigger and dropdown rows. */
export function workspaceSublabel(workspace: WorkspaceDisplayFacts): string {
  const state = workspaceState(workspace);
  if (state === "empty") {
    return "New project";
  }
  if (state === "no-data") {
    return `${KEYWORD_FORMAT.format(workspace.keywordCount)} queued · no data`;
  }
  return keywordLabel(workspace.keywordCount);
}

/** Dropdown-row meta mirrors the active trigger sublabel. */
export function workspaceRowMeta(workspace: WorkspaceDisplayFacts): string {
  return workspaceSublabel(workspace);
}
