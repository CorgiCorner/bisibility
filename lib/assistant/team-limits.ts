import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { AssistantRequestError } from "./access";
import {
  type AssistantGuardConfig,
  centsToMicroUsd,
  readAssistantGuardConfig,
} from "./guard-config";
import { hostedSpendMicroUsd, utcDayStart } from "./hosted-spend";
import { ACTIVE_RUN_STATUSES, type RunStatus } from "./wire";

/**
 * A Credits run untouched for this long is treated as abandoned for the concurrency count, so a
 * crashed process cannot lock a team out; the recovery sweep closes it separately.
 */
export const STALE_ACTIVE_RUN_MS = 30 * 60000;

/**
 * Runs that hold a simultaneous-turn slot. A run waiting for a tool approval keeps its slot, so
 * approving many waiting runs at once cannot exceed the cap when they resume.
 */
export const SLOT_RUN_STATUSES: readonly RunStatus[] = [
  ...ACTIVE_RUN_STATUSES,
  "awaiting_approval",
];

/**
 * The refusal a team gets for its hosted spend today, or null to proceed. A step also counts what
 * its own reservation may cost, so it cannot carry the team past the cap.
 */
export function teamDailyRefusal(spentMicro: bigint, config: AssistantGuardConfig, nextMicro = 0n) {
  const cap = centsToMicroUsd(config["assistant.guard.teamDailyCents"]);
  return spentMicro >= cap || spentMicro + nextMicro > cap ? ("team_daily_limit" as const) : null;
}

/** The refusal a team gets for one more simultaneous Credits turn, or null to proceed. */
export function teamConcurrencyRefusal(active: number, config: AssistantGuardConfig) {
  return active >= config["assistant.guard.teamConcurrentTurns"]
    ? ("team_concurrency_limit" as const)
    : null;
}

export async function teamHostedSpendToday(
  tx: Prisma.TransactionClient,
  projectId: string,
  now: Date,
) {
  return hostedSpendMicroUsd(tx, { since: utcDayStart(now), projectId });
}

/**
 * Turn start, Credits only, inside the turn transaction and before the run row exists: refuses a
 * team over its daily hosted spend or at its simultaneous-turn cap. A per-project advisory lock
 * serializes concurrent starts, so two turns cannot both see one free slot.
 */
export async function assertTeamTurnAllowed(
  tx: Prisma.TransactionClient,
  projectId: string,
  now = new Date(),
) {
  await tx.$queryRaw`SELECT 1 AS acquired FROM pg_advisory_xact_lock(hashtextextended(${`assistant-team:${projectId}`},0))`;
  const config = await readAssistantGuardConfig(tx);
  const active = await tx.assistantRun.count({
    where: {
      projectId,
      funding: "credits",
      status: { in: [...SLOT_RUN_STATUSES] },
      updatedAt: { gte: new Date(now.getTime() - STALE_ACTIVE_RUN_MS) },
    },
  });
  const busy = teamConcurrencyRefusal(active, config);
  if (busy) throw new AssistantRequestError(busy, 429);
  const daily = teamDailyRefusal(await teamHostedSpendToday(tx, projectId, now), config);
  if (daily) throw new AssistantRequestError(daily, 429);
}
