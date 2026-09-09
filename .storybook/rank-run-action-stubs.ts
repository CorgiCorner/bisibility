import type {
  LaunchRankCheckRunActionInput,
  LaunchRankCheckRunActionResult,
} from "@/lib/actions/rank-check-run-launch-result";

const STORYBOOK_ONLY_LAUNCH_RESULT = {
  estimatedCostCents: 0,
  keywordCount: 0,
  publicId: "rcr_storybook_preview",
  status: "queued",
  targetCount: 0,
} satisfies LaunchRankCheckRunActionResult;

export async function launchRankCheckRunAction(
  _input: LaunchRankCheckRunActionInput,
): Promise<LaunchRankCheckRunActionResult> {
  return STORYBOOK_ONLY_LAUNCH_RESULT;
}
