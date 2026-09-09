import "server-only";

import type { SerpDepth } from "@/lib/serp/constants";
import { launchRankCheckRun } from "./launch";
import {
  ALREADY_IN_PROGRESS_REASON,
  isLaunchRankCheckRunNothingToRun,
  type LaunchRankCheckRunResult,
  launchRankCheckRunNothingToRun,
  nothingToRunReasonFromExclusion,
  type RankCheckRunProject,
} from "./launch-types";
import { previewRankCheckRun } from "./preview";

type LaunchSingleRankCheckRunInput = {
  actorId: string | null;
  depth?: SerpDepth;
  keywordId: `kw_${string}`;
  project: RankCheckRunProject;
  providerId?: string;
  trigger: "api" | "manual";
};

export async function launchSingleRankCheckRun(
  input: LaunchSingleRankCheckRunInput,
): Promise<LaunchRankCheckRunResult> {
  const spec = { kind: "single" as const, keywordId: input.keywordId, v: 1 as const };
  const preview = await previewRankCheckRun({
    depth: input.depth,
    project: input.project,
    providerId: input.providerId,
    spec,
  });
  const launched = await launchRankCheckRun({
    actorId: input.actorId,
    depth: input.depth,
    previewToken: preview.previewToken,
    project: input.project,
    providerId: input.providerId,
    spec,
    trigger: input.trigger,
  });
  if (!isLaunchRankCheckRunNothingToRun(launched)) return launched;
  // The launch reads the row under a lock and is the later read, so a predicate verdict from it
  // wins outright. It falls back to "already in progress" when it had no row to judge - the one
  // case where the preview, which resolved this same keyword moments earlier and already recorded
  // why it excluded it, knows the cause and the launch does not. Carrying that reason through is
  // the difference between naming the paused market and inventing a check that is not running.
  if (launched.reason !== ALREADY_IN_PROGRESS_REASON) return launched;
  const excluded = preview.excluded.find(({ keywordId }) => keywordId === input.keywordId);
  const carried = nothingToRunReasonFromExclusion(excluded?.reason);
  return carried ? launchRankCheckRunNothingToRun(carried) : launched;
}
