import { Context } from "@temporalio/activity";
import { vi } from "vitest";
import { definitionQueryFixture } from "./definition-policy.test-fixture";

export function definitionActivityContextFixture(workflowRunId = "run_manual_1") {
  return vi.spyOn(Context, "current").mockReturnValue({
    info: {
      workflowExecution: {
        workflowId: "rank-check-keyword_1",
        runId: workflowRunId,
      },
    },
  } as unknown as Context);
}

/** Existing rank-check CAS is modelled once per row; replay cannot fabricate another permit. */
export function definitionClaimQueryFixture(options: { allowed?: boolean } = {}) {
  const claimed = new Set<string>();
  return definitionQueryFixture(async (query, ...values) => {
    const sql = (
      Array.isArray(query)
        ? query
        : (query as import("@/lib/generated/prisma/client").Prisma.Sql).strings
    ).join("?");
    const parameters = Array.isArray(query)
      ? values
      : (query as import("@/lib/generated/prisma/client").Prisma.Sql).values;
    if (sql.includes('UPDATE rank_checks SET "attemptCount"=1')) {
      const rankCheckId = String(parameters[2]);
      if (options.allowed === false || claimed.has(rankCheckId)) return [];
      claimed.add(rankCheckId);
      return [
        {
          id: rankCheckId,
          principal: {
            actorId: "user_1",
            runId: "run_1",
            runItemId: "item_1",
            source: "app",
            trigger: "manual",
            credentialKind: null,
            credentialId: null,
            selectionKind: "selected",
            selectionHash: "a".repeat(64),
            checkScheduleId: null,
          },
        },
      ];
    }
    if (sql.includes('SELECT r."publicId",c."workflowRunId"')) {
      const publicId = "rcr_abcdefghijklmnopqrstuvwx";
      return [{ publicId, workflowRunId: "inline-" + publicId }];
    }
    return [];
  });
}
