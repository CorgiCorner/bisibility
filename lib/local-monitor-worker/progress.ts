import type { readLocalHostRun } from "@/lib/local-monitoring-host/read";

type Item = Pick<
  Awaited<ReturnType<typeof readLocalHostRun>>["items"][number],
  "targetId" | "status" | "resolution" | "ownerRetained"
>;
/** Collection expiry stops GET polling, but cannot strand proven-unsent cleanup behind another unknown item. */
export function monitorProgress(
  items: readonly Item[],
  blockedTargets: ReadonlySet<string>,
  deadline: Date,
  now: Date,
): "pending" | "blocked" | "complete" {
  if (!items.length) return "blocked";
  if (items.every((item) => item.resolution === "complete" || item.resolution === "cancelled"))
    return "complete";
  const cleanup = items.some(
    (item) =>
      (item.status === "claimed" || item.status === "cancelled") &&
      item.ownerRetained &&
      !blockedTargets.has(item.targetId),
  );
  const outstanding = items.some((item) =>
    [
      "awaiting_dispatch",
      "awaiting_collection",
      "accounting_pending",
      "owner_release_pending",
    ].includes(item.resolution),
  );
  if ((now >= deadline && !cleanup) || (blockedTargets.size > 0 && !outstanding)) return "blocked";
  return "pending";
}
