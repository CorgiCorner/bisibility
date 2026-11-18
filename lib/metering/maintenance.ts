import "server-only";
import { ASSISTANT_METERING_NAMESPACE } from "@/lib/assistant/accounting-scope";
import { notifyOps } from "@/lib/ops/notify";
import { meteringNamespace, meteringRuntime } from "./runtime";

export async function maintainMeteringReservations() {
  try {
    const { meter } = await meteringRuntime();
    let count = 0;
    let hasMore = false;
    // The assistant meters in its own namespace, so its reservations expire here as well.
    for (const namespace of new Set([meteringNamespace(), ASSISTANT_METERING_NAMESPACE])) {
      const result = await meter.expireReservations({ namespace, limit: 100 });
      if (result.outcome !== "expired") throw new Error("Meter reservation expiry refused");
      count += result.count;
      hasMore ||= result.hasMore;
    }
    const { releaseStaleAssistantAttempts } = await import("@/lib/assistant/accounting-recovery");
    const { prisma } = await import("@/lib/db/prisma");
    await prisma.$transaction((tx) => releaseStaleAssistantAttempts(tx));
    // Stopped assistant answers are charged here at the latest by their settlement deadline.
    const { settleDueStoppedAssistantAttempts } = await import("@/lib/assistant/stop-settlement");
    await settleDueStoppedAssistantAttempts();
    const { maintainModelFunding } = await import("@/lib/model-playground/funding-extension");
    await maintainModelFunding(prisma);
    return { count, hasMore };
  } catch (error) {
    await notifyOps({
      dedupeKey: "metering_maintenance_failed",
      kind: "metering_maintenance_failed",
      severity: "error",
      title: "Accounting reservation maintenance failed; retry is required",
      fields: { Namespace: meteringNamespace() },
    }).catch(() => console.error("[metering] maintenance health reporting failed"));
    throw error;
  } finally {
    // The platform spend breaker runs every minute even when a step above failed: a failing
    // settlement is exactly when hosted spend may be piling up unseen.
    const { runAssistantSpendBreaker } = await import("@/lib/assistant/spend-breaker");
    await runAssistantSpendBreaker().catch((error) =>
      console.error("[assistant] spend breaker check failed", { error }),
    );
  }
}
