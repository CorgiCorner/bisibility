// Temporal sandbox module: no Prisma, client, Node built-ins, or side effects.
import { continueAsNew, proxyActivities } from "@temporalio/workflow";
import type { PlanRankCheckRunsResult } from "../rank-check/planner/plan";
import type { PlanRankCheckRunsActivityInput } from "./rank-check-planner-activities";

type PlannerActivities = {
  launchDuePlannedRunsActivity(input: {
    cursor: { id: string; plannedFor: string } | null;
    limit: number;
    now: string;
  }): Promise<{
    cursor: { id: string; plannedFor: string } | null;
    hasMore: boolean;
    launched: number;
    scanned: number;
  }>;
  planRankCheckRunsActivity(
    input: PlanRankCheckRunsActivityInput,
  ): Promise<PlanRankCheckRunsResult>;
};

const { launchDuePlannedRunsActivity, planRankCheckRunsActivity } =
  proxyActivities<PlannerActivities>({
    retry: {
      backoffCoefficient: 2,
      initialInterval: "5 seconds",
      maximumAttempts: 3,
      maximumInterval: "30 seconds",
    },
    startToCloseTimeout: "5 minutes",
  });

const SCHEDULE_PAGE_SIZE = 200;
const DUE_LAUNCH_LIMIT = 500;
const MAX_DUE_LAUNCH_PAGES = 20;

export type RankCheckPlannerWorkflowState = {
  blocked: number;
  cursor: string | null;
  launched: number;
  now: string;
  planned: number;
  schedules: number;
};

export async function planRankCheckRunsWorkflow(
  state?: RankCheckPlannerWorkflowState,
): Promise<Omit<RankCheckPlannerWorkflowState, "cursor">> {
  const now = state?.now ?? new Date().toISOString();
  const page = await planRankCheckRunsActivity({
    cursor: state?.cursor ?? null,
    limit: SCHEDULE_PAGE_SIZE,
    now,
  });
  let launched = 0;
  let dueCursor: { id: string; plannedFor: string } | null = null;
  for (let page = 0; page < MAX_DUE_LAUNCH_PAGES; page += 1) {
    const launch: {
      cursor: { id: string; plannedFor: string } | null;
      hasMore: boolean;
      launched: number;
    } = await launchDuePlannedRunsActivity({ cursor: dueCursor, limit: DUE_LAUNCH_LIMIT, now });
    launched += launch.launched;
    if (!launch.hasMore || !launch.cursor) break;
    dueCursor = launch.cursor;
  }
  const next = {
    blocked: (state?.blocked ?? 0) + page.blocked,
    cursor: page.cursor,
    launched: (state?.launched ?? 0) + launched,
    now,
    planned: (state?.planned ?? 0) + page.planned,
    schedules: (state?.schedules ?? 0) + page.schedules,
  };
  if (!page.done && page.cursor) {
    return continueAsNew<typeof planRankCheckRunsWorkflow>(next);
  }
  const { cursor: _cursor, ...result } = next;
  return result;
}
