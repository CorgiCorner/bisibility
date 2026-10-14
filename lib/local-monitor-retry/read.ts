import "server-only";
import { prisma } from "@/lib/db/prisma";
import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { localProjectScope } from "@/lib/local-monitoring-store/access";
import type { LocalDatabase, LocalStoreContext } from "@/lib/local-monitoring-store/context";
import { z } from "zod";
import { readMonitorRetryProof } from "./proof";
import { loadMonitorRetryParent } from "./selection";

const inputSchema = z
  .object({
    projectId: z.string().refine((v) => isPublicIdOfType(v, "prj")),
    monitorId: z.string().refine((v) => isPublicIdOfType(v, "lmn")),
    runId: z.string().refine((v) => isPublicIdOfType(v, "lmr")),
  })
  .strict();
/** Authorization, retained scope and native financial reads only. No provider, quote, reserve or scheduler. */
export async function readMonitorRetryOptions(
  input: unknown,
  context: LocalStoreContext,
  db: LocalDatabase = prisma,
) {
  const command = inputSchema.parse(input);
  return db.$transaction(
    async (tx) => {
      const scope = await localProjectScope(tx, context, command.projectId, "read");
      const { parent } = await loadMonitorRetryParent(
        tx,
        scope.project.id,
        command.monitorId,
        command.runId,
        new Date(),
      );
      const connections = await tx.providerConnection.findMany({
        where: {
          projectId: scope.project.id,
          kind: "serp",
          status: "connected",
          enabled: true,
          credentialSource: "own",
        },
        select: { publicId: true, provider: true },
        orderBy: { publicId: "asc" },
      });
      const rows = [];
      for (const row of parent.rows) {
        const proof = await readMonitorRetryProof(tx, row);
        rows.push({
          targetId: row.stored.publicId,
          keyword: row.keyword.text,
          ordinal: row.gridPoint.ordinal,
          row: row.gridPoint.row,
          column: row.gridPoint.column,
          latitude: row.point.coordinate.latitude,
          longitude: row.point.coordinate.longitude,
          status: row.record.status,
          eligible: proof.eligible,
          reason: proof.reason,
          financialState: proof.financialState,
        });
      }
      return {
        parentRunId: parent.run.publicId,
        parentExpectedCount: parent.run.expectedTargetKeys.length,
        definitionRevisionId: parent.revision.id,
        scheduleIntentId: parent.occurrence.scheduleIntentId,
        retry: parent.retry
          ? {
              parentRunId: parent.retry.approval.parentRunId,
              parentExpectedCount: parent.retry.approval.parentExpectedCount,
              selectedCount: parent.rows.length,
            }
          : null,
        rows,
        connections: connections.map((row) => ({ id: row.publicId, provider: row.provider })),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export type MonitorRetryOptions = Awaited<ReturnType<typeof readMonitorRetryOptions>>;
