export const PUSH_NOT_CONFIGURED_TYPE = "push_not_configured";

export type DeliveryCounts = {
  acceptedCount: number;
  failedCount: number;
  unknownCount: number;
};

export type DeliverySummary = {
  channel: "email" | "push" | "slack" | "webhook";
  counts?: DeliveryCounts;
  status: string;
};

export function storedDeliverySummary(value: unknown): DeliverySummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) => {
    if (
      !item ||
      typeof item !== "object" ||
      !("channel" in item) ||
      (item.channel !== "email" &&
        item.channel !== "push" &&
        item.channel !== "slack" &&
        item.channel !== "webhook")
    )
      return [];
    if (!("counts" in item) || item.counts == null) {
      return "status" in item &&
        typeof item.status === "string" &&
        ["sent", "failed", "skipped", "unknown"].includes(item.status)
        ? [{ channel: item.channel, status: item.status }]
        : [];
    }
    const counts = item.counts;
    if (
      !counts ||
      typeof counts !== "object" ||
      !("acceptedCount" in counts) ||
      !("failedCount" in counts) ||
      !("unknownCount" in counts)
    )
      return [];
    const { acceptedCount, failedCount, unknownCount } = counts;
    if (
      typeof acceptedCount !== "number" ||
      typeof failedCount !== "number" ||
      typeof unknownCount !== "number" ||
      ![acceptedCount, failedCount, unknownCount].every(
        (count) => Number.isSafeInteger(count) && count >= 0,
      )
    )
      return [];
    const measured = { acceptedCount, failedCount, unknownCount };
    return [{ channel: item.channel, counts: measured, status: countedDeliveryStatus(measured) }];
  });
}

export function countedDeliveryStatus(counts: DeliveryCounts) {
  if (counts.acceptedCount > 0) {
    return counts.failedCount + counts.unknownCount > 0 ? "partial" : "sent";
  }
  if (counts.unknownCount > 0) return "unknown";
  return counts.failedCount > 0 ? "failed" : "skipped";
}

export function storedDeliveryCounts(row: {
  acceptedCount?: number | null;
  failedCount?: number | null;
  unknownCount?: number | null;
}): DeliveryCounts | undefined {
  if (row.acceptedCount == null || row.failedCount == null || row.unknownCount == null) {
    return undefined;
  }
  return {
    acceptedCount: row.acceptedCount,
    failedCount: row.failedCount,
    unknownCount: row.unknownCount,
  };
}
