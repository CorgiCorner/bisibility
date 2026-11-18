import type { Prisma } from "@/lib/generated/prisma/client";
import type { TrackingTransaction } from "./shared";

export async function finishRun(tx: TrackingTransaction, projectId: string, runId: string) {
  const remaining = await tx.aiTrackingSample.count({
    where: { projectId, runId, dispatch: { not: "terminal" } },
  });
  if (remaining) return false;
  const samples = await tx.aiTrackingSample.findMany({
    where: { projectId, runId },
    select: { measurement: true },
  });
  const successes = samples.filter((sample) =>
    ["answer_present", "aio_not_present"].includes(sample.measurement),
  ).length;
  const state =
    successes === samples.length
      ? "completed"
      : successes > 0 || samples.some((sample) => sample.measurement === "partial")
        ? "partial"
        : samples.every((sample) => sample.measurement === "unavailable")
          ? "blocked"
          : "failed";
  const where: Prisma.AiTrackingRunWhereInput = {
    projectId,
    id: runId,
    state: { in: ["running", "planned"] },
  };
  if (state === "blocked")
    await tx.aiTrackingRun.updateMany({
      where: { ...where, reasonCode: null },
      data: { reasonCode: "samples_unavailable" },
    });
  const changed = await tx.aiTrackingRun.updateMany({
    where,
    data: { state, finishedAt: new Date() },
  });
  return changed.count > 0;
}
