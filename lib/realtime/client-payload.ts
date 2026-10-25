import type { NotificationFeed } from "@/lib/queries/notifications";
import { type OperationSnapshot, operationSnapshotSchema } from "@/lib/rank-check/runs/contract";

export function jsonFromEvent(event: Event): unknown {
  try {
    return JSON.parse((event as MessageEvent<string>).data);
  } catch {
    return null;
  }
}

export function notificationFromEvent(event: Event) {
  const value = jsonFromEvent(event) as { feed?: NotificationFeed } | null;
  const feed = value?.feed;
  return feed && Array.isArray(feed.items) && Number.isFinite(feed.unreadCount) ? feed : null;
}

export function operationsFromValue(value: unknown) {
  const data = value as { operations?: unknown; rankDataRevision?: unknown } | null;
  const parsed = operationSnapshotSchema.array().safeParse(data?.operations);
  if (!parsed.success) return null;
  return {
    operations: parsed.data,
    rankDataRevision: typeof data?.rankDataRevision === "string" ? data.rankDataRevision : null,
  };
}

export function rankDataSignature(operations: OperationSnapshot[]) {
  return JSON.stringify(
    operations
      .filter((operation) => operation.kind === "rank_check")
      .map((run) => [
        run.id,
        run.status,
        run.counts.completed,
        run.counts.failed,
        run.counts.deferred,
        run.counts.cancelled,
        run.blockedReason,
      ])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
}
