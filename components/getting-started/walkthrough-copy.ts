import type { SetupStepId, SetupStepState } from "@/lib/getting-started/setup-steps";

type WalkthroughStepId = Exclude<SetupStepId, "confirm_competitors">;

/** Returns a typed presentation key while setup state remains free of display copy. */
export function walkthroughMessageKey(
  id: WalkthroughStepId,
  state: SetupStepState,
): `walkthrough.${WalkthroughStepId}.active` | `walkthrough.${WalkthroughStepId}.done` {
  return `walkthrough.${id}.${state.family === "done" ? "done" : "active"}`;
}
