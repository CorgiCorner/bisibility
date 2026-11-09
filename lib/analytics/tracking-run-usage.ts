import "server-only";
import { prisma } from "@/lib/db/prisma";
import { queueRequestUsageEvent, queueRequestUsageTask } from "./request-usage-delivery";

/** One terminal tracking run can contain many provider samples and polls. */
export function queueTrackingRunUsage(runId: string) {
  try {
    queueRequestUsageTask(async () => {
      const run = await prisma.aiTrackingRun.findUnique({
        where: { id: runId },
        select: {
          id: true,
          createdAt: true,
          actorId: true,
          samples: {
            orderBy: [{ finishedAt: "asc" }, { id: "asc" }],
            select: { measurement: true, plan: true, receipt: true },
          },
        },
      });
      if (!run) return;
      const sample = run.samples.find(({ measurement, plan, receipt }) => {
        if (measurement === "failed" || measurement === "unknown") return false;
        if (
          !plan ||
          typeof plan !== "object" ||
          Array.isArray(plan) ||
          (plan as Record<string, unknown>).provider !== "dataforseo"
        )
          return false;
        if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) return false;
        const value = receipt as Record<string, unknown>;
        return (
          value.noDispatch !== true &&
          ["confirmed", "derived"].includes(String(value.state)) &&
          typeof value.amountUsd === "string" &&
          Number.isFinite(Number(value.amountUsd)) &&
          Number(value.amountUsd) > 0
        );
      });
      if (!sample?.plan || typeof sample.plan !== "object" || Array.isArray(sample.plan)) return;
      const plan = sample.plan as Record<string, unknown>;
      queueRequestUsageEvent({
        operationKey: `tracking-run/${run.id}`,
        userId: run.actorId,
        timestamp: run.createdAt,
        properties: {
          provider: "dataforseo",
          feature: "ai_tracking",
          payment: "byok",
          trigger:
            plan.origin === "scheduled"
              ? "scheduled"
              : ["api", "mcp", "cli", "sdk"].includes(String(plan.entrySource))
                ? "api"
                : plan.origin === "manual"
                  ? "manual"
                  : "unknown",
        },
      });
    });
  } catch {
    /* Delivery is optional. */
  }
}
