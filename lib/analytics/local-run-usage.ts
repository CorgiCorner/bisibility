import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { ProviderUsageReceipt } from "@/lib/providers/usage";
import { classifyRequestUsage } from "./request-usage";
import { queueRequestUsageEvent, queueRequestUsageTask } from "./request-usage-delivery";

/** Called only after the original local item settlement transaction commits. */
export function queueLocalRunUsage(
  projectId: string,
  runId: string,
  receipt: ProviderUsageReceipt,
) {
  if (
    classifyRequestUsage({ ...receipt, provider: "dataforseo", used: true }) !== "paid_request_used"
  )
    return;
  queueRequestUsageTask(async () => {
    const run = await prisma.localMeasurementRun.findFirst({
      where: { id: runId, projectId },
      select: {
        actorId: true,
        createdAt: true,
        source: true,
        trigger: true,
        projects: { select: { ownerId: true } },
      },
    });
    if (!run) return;
    queueRequestUsageEvent({
      operationKey: `local-run/${runId}`,
      userId: run.actorId ?? run.projects.ownerId,
      timestamp: run.createdAt,
      properties: {
        provider: "dataforseo",
        feature: "local_scan",
        payment: "byok",
        trigger: ["api", "mcp", "sdk", "cli"].includes(run.source)
          ? "api"
          : run.trigger === "scheduled"
            ? "scheduled"
            : run.trigger === "manual"
              ? "manual"
              : "unknown",
      },
    });
  });
}
