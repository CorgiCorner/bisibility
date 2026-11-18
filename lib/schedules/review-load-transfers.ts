import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { resolveSerpDepth } from "@/lib/serp/constants";
import { scheduleNotFound } from "./errors";
import {
  cadenceIsActive,
  providerForPolicy,
  type ReviewCadence,
  rankUnitCents,
} from "./review-cost";
import {
  asCadence,
  idle,
  pack,
  projectSerpProviderId,
  quote,
  rankSelect,
} from "./review-load-shared";

export type MarketReactivationChange = {
  op: "market-reactivate";
  marketIds: readonly string[];
  mode: "resume" | "restore" | "add";
};
export type TransferChange =
  | MarketReactivationChange
  | {
      op: "state";
      id: string;
      state: "archived";
      command: {
        kind: "rank";
        archive?: { destinationScheduleId: string | null };
        destinationScheduleId?: string | null;
      };
    };

/** Snapshot all affected tuples and their effective schedules on the receipt's client. */
export async function loadTransfer(
  client: Prisma.TransactionClient,
  projectId: string,
  change: TransferChange,
  now: Date,
) {
  const defaults = await client.projectDefaults.findUnique({
    where: { projectId },
    select: { serpDepth: true, timezone: true },
  });
  const depth = resolveSerpDepth(defaults?.serpDepth);
  const timezone = defaults?.timezone ?? "UTC";
  const provider = await projectSerpProviderId(client, projectId);
  const marketChange = change.op === "market-reactivate";
  const source = !marketChange
    ? await client.checkSchedule.findFirst({
        where: { projectId, publicId: change.id },
        select: rankSelect,
      })
    : null;
  if (!marketChange && !source) throw scheduleNotFound();
  const destinationId =
    !marketChange && change.command.kind === "rank"
      ? (change.command.archive?.destinationScheduleId ?? change.command.destinationScheduleId)
      : null;
  const destination = destinationId
    ? await client.checkSchedule.findFirst({
        where: { projectId, publicId: destinationId, archivedAt: null },
        select: rankSelect,
      })
    : null;
  if (destinationId && !destination) throw scheduleNotFound();
  const markets = await client.projectMarket.findMany({
    where: { projectId, ...(marketChange ? { publicId: { in: [...change.marketIds] } } : {}) },
    select: { publicId: true, locationId: true, status: true },
    orderBy: { publicId: "asc" },
  });
  const keywords = await client.keyword.findMany({
    where: {
      projectId,
      ...(marketChange
        ? { locationId: { in: markets.map((market) => market.locationId) } }
        : { checkSchedule: { publicId: change.id } }),
    },
    select: {
      publicId: true,
      text: true,
      device: true,
      locationId: true,
      archivedAt: true,
      measurementTargetEpoch: true,
      checkScheduleId: true,
      checkSchedule: { select: rankSelect },
    },
    orderBy: { publicId: "asc" },
  });
  const activeLocations = new Set(
    markets.filter((market) => market.status === "active").map((market) => market.locationId),
  );
  const groups = keywords
    .filter(
      (row) =>
        !row.archivedAt &&
        !source?.archivedAt &&
        (marketChange ? !activeLocations.has(row.locationId) : activeLocations.has(row.locationId)),
    )
    .map((row) => {
      const before = row.checkSchedule ? asCadence(row.checkSchedule, timezone) : null;
      const after = marketChange ? before : destination ? asCadence(destination, timezone) : null;
      const beforePolicy = row.checkSchedule?.providerPolicy ?? null;
      const afterPolicy = marketChange ? beforePolicy : (destination?.providerPolicy ?? null);
      const priced = (cadence: typeof before, policy: string | null) =>
        quote(
          cadence,
          1,
          rankUnitCents(
            resolveSerpDepth(cadence?.serpDepth ?? depth),
            providerForPolicy(policy, provider),
          ),
        );
      return {
        before:
          marketChange && !activeLocations.has(row.locationId)
            ? idle()
            : priced(before, beforePolicy),
        after: priced(after, afterPolicy),
        providerBefore: beforePolicy,
        providerAfter: afterPolicy,
      };
    });
  // Resolve only the spend proof; the revision retains raw inheritance below.
  const spendKey = (cadence: ReviewCadence | null) =>
    JSON.stringify(
      cadence && {
        ...cadence,
        publicId: "",
        serpDepth: resolveSerpDepth(cadence.serpDepth ?? depth),
      },
    );
  const sameSpend = groups.every(
    (group) =>
      providerForPolicy(group.providerBefore, provider) ===
        providerForPolicy(group.providerAfter, provider) &&
      spendKey(group.before.cadence) === spendKey(group.after.cadence),
  );
  const operation = !groups.some((group) => cadenceIsActive(group.after.cadence))
    ? "manual"
    : sameSpend
      ? "noop"
      : "assign";
  const loaded = pack(
    depth,
    now,
    operation,
    groups[0]?.before ?? idle(),
    groups[0]?.after ?? idle(),
    groups.some(
      (group) => !cadenceIsActive(group.before.cadence) && cadenceIsActive(group.after.cadence),
    ),
    null,
    null,
    [defaults, provider, source, destination, markets, keywords],
    { kind: "transfer", change },
  );
  loaded.spend.groups = groups;
  return loaded;
}
