export const GETTING_STARTED_RAIL_LABEL = "Get started";
export const GETTING_STARTED_SUBTITLE_INCOMPLETE = "Four steps to your first positions.";
export const GETTING_STARTED_SUBTITLE_COMPLETE = "Done. Everything below is optional.";
export const FINISH_SETUP_CTA = "Finish setup";
export const FINISH_SETUP_HELPER =
  "Removes Get started from the sidebar. The page stays at this address.";
export const SEE_DASHBOARD_CTA = "See the dashboard";
export const SETUP_FINISHED_HEADLINE = "Setup finished.";
export const SETUP_COMPLETE_HEADLINE = "Setup complete - first positions are in.";
export const SETUP_ACK_WRITE_ERROR = "Could not save setup confirmation. Try again in a moment.";
export const SETUP_ACK_CHECKLIST_ERROR =
  "Setup changed before it could be completed. Review the checklist and try again.";

const STEP_COUNT_WORDS: Record<number, string> = {
  4: "Four",
  5: "Five",
};

export function gettingStartedSubtitle(completed: boolean, totalCount = 4): string {
  if (completed) {
    return GETTING_STARTED_SUBTITLE_COMPLETE;
  }
  if (totalCount === 4) {
    return GETTING_STARTED_SUBTITLE_INCOMPLETE;
  }
  const word = STEP_COUNT_WORDS[totalCount] ?? String(totalCount);
  return `${word} steps to your first positions.`;
}

export function formatSetupProgressLabel(settledCount: number, totalCount: number): string {
  return `${settledCount} of ${totalCount} steps`;
}

export function gettingStartedProgressAriaLabel(settledCount: number, totalCount: number): string {
  return `${GETTING_STARTED_RAIL_LABEL}, ${formatSetupProgressLabel(settledCount, totalCount)} complete`;
}
