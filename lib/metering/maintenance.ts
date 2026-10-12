import "server-only";
import { notifyOps } from "@/lib/ops/notify";
import { meteringNamespace, meteringRuntime } from "./runtime";

export async function maintainMeteringReservations() {
  try {
    const { meter } = await meteringRuntime();
    const result = await meter.expireReservations({ namespace: meteringNamespace(), limit: 100 });
    if (result.outcome !== "expired") throw new Error("Meter reservation expiry refused");
    return { count: result.count, hasMore: result.hasMore };
  } catch (error) {
    await notifyOps({
      dedupeKey: "metering_maintenance_failed",
      kind: "metering_maintenance_failed",
      severity: "error",
      title: "Accounting reservation maintenance failed; retry is required",
      fields: { Namespace: meteringNamespace() },
    }).catch(() => console.error("[metering] maintenance health reporting failed"));
    throw error;
  }
}
