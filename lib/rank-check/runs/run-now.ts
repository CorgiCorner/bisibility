import "server-only";

import { ApiConflictError } from "@/lib/api/errors";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { runPlannedRunNow } from "@/lib/rank-check/planner/skip-run-now";

const transactionOptions = { maxWait: 10_000, timeout: 60_000 } as const;

export async function runRankCheckRunNowCommand(input: {
  actorId: string;
  orchestrationWorkflowId: string | null;
  projectId: string;
  runId: string;
  publicId: string;
}) {
  if (!input.orchestrationWorkflowId) {
    throw new ApiConflictError("Rank-check run data defect: reserved workflow ID is missing.");
  }
  if (!(await runPlannedRunNow(input.runId))) {
    throw new ApiConflictError("Only planned runs can be run now.");
  }
  await prisma.$transaction(
    (tx) =>
      writeAudit(
        {
          action: "rank_check_run.run_now",
          actorId: input.actorId,
          after: { status: "queued" },
          projectId: input.projectId,
          targetId: requiredPublicAuditId(input.publicId, "rcr", "Rank-check run"),
          targetType: "rank_check_run",
        },
        tx,
      ),
    transactionOptions,
  );
}
