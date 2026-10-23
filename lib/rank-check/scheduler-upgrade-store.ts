import "server-only";
import { prisma } from "@/lib/db/prisma";
import { convergeRankCheckSchedulerSingletons } from "@/lib/temporal/rank-check-scheduler-convergence";
import { getSchedulerTemporalClient } from "@/lib/temporal/scheduler-client";
import type { Client } from "@temporalio/client";
import type { SchedulerUpgradeStore } from "./scheduler-upgrade";
import {
  publicUpgradeConflict,
  readSchedulerUpgradeConflicts,
} from "./scheduler-upgrade-conflicts";
import { unknownUpgradeSchedule } from "./scheduler-upgrade-unknown";
import {
  inventoryRankCheckSchedules,
  pauseOwnedRankCheckSchedule,
} from "./temporal-schedule-inventory";

export async function schedulerUpgradeConflicts(
  database: Pick<typeof prisma, "$queryRaw"> = prisma,
) {
  return (await readSchedulerUpgradeConflicts(database)).map((row) => row.keywordId);
}

export function createSchedulerUpgradeStore(
  client: Client,
  database = prisma,
): SchedulerUpgradeStore {
  return {
    close: () => client.connection.close(),
    inventory: async () => {
      const inventory = await inventoryRankCheckSchedules(200, client.schedule);
      const keywords = [];
      // Bound Prisma's IN parameter count for large self-host installations.
      for (let offset = 0; offset < inventory.ownedIds.length; offset += 500) {
        keywords.push(
          ...(await database.keyword.findMany({
            where: {
              id: {
                in: inventory.ownedIds
                  .slice(offset, offset + 500)
                  .map((id) => id.slice("rank-check-".length)),
              },
            },
            select: { id: true, projectId: true },
          })),
        );
      }
      const known = new Map(keywords.map((keyword) => [keyword.id, keyword.projectId]));
      const unknownSchedules = [];
      for (const id of [...inventory.ownedIds, ...inventory.ambiguousIds]) {
        const description = await client.schedule.getHandle(id).describe();
        if (inventory.ambiguousIds.includes(id)) {
          unknownSchedules.push(
            unknownUpgradeSchedule(
              id,
              "ambiguous_ownership",
              description.state.paused,
              client.options.namespace,
            ),
          );
          continue;
        }
        const projectId = known.get(id.slice("rank-check-".length));
        if (projectId !== description.memo?.projectId) {
          unknownSchedules.push(
            unknownUpgradeSchedule(
              id,
              projectId === undefined ? "keyword_missing" : "project_mismatch",
              description.state.paused,
              client.options.namespace,
            ),
          );
        }
      }
      return {
        ...inventory,
        unknownSchedules,
        ambiguousIds: [
          ...new Set([...inventory.ambiguousIds, ...unknownSchedules.map((row) => row.id)]),
        ],
      };
    },
    conflicts: () => schedulerUpgradeConflicts(database),
    conflictDetails: async () =>
      (await readSchedulerUpgradeConflicts(database)).map(publicUpgradeConflict),
    pauseSingletons: () => convergeRankCheckSchedulerSingletons(client.schedule, "cutover"),
    pauseOwned: (id) => pauseOwnedRankCheckSchedule(id, client.schedule),
    running: async () =>
      (
        await client.workflow.count(
          'ExecutionStatus = "Running" AND (WorkflowType = "rankCheckWorkflow" OR WorkflowType = "rankCheckRunWorkflow" OR WorkflowType = "dispatchDueRankChecksWorkflow" OR WorkflowType = "planRankCheckRunsWorkflow" OR WorkflowType = "reconcileRankCheckSchedulesWorkflow")',
        )
      ).count,
    activate: () => convergeRankCheckSchedulerSingletons(client.schedule, "dispatcher"),
  };
}

export async function schedulerUpgradeStore() {
  return createSchedulerUpgradeStore(await getSchedulerTemporalClient());
}
