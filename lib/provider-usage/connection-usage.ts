import "server-only";

import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { ProviderAllocationUnit } from "@/lib/providers/allocation-catalog";
import { monthUtcRange } from "@/lib/rank-check/budget";
import { type ProviderRequestSurface, SOURCES_BY_SURFACE } from "./surface";

type ConnectionUsageClient = {
  providerCostEntry: Pick<PrismaClient["providerCostEntry"], "aggregate" | "count">;
};

export type ConnectionUsage = {
  /** Requests in scope that have not settled a confirmed measurement yet. */
  unconfirmedCount: number;
  /** All non-cached requests in scope, confirmed or not. */
  requestCount: number;
  /** Confirmed usage only: settled cost cents, or measured native quantity. */
  used: number;
};

function number(value: unknown) {
  return Number(value ?? 0);
}

function surfaceSourceFilter(surface: ProviderRequestSurface | undefined) {
  if (!surface) return undefined;
  if (surface === "app") {
    // Legacy rows without a source belong to the app surface.
    return { OR: [{ source: { in: [...SOURCES_BY_SURFACE.app] } }, { source: null }] };
  }
  return { source: { in: [...SOURCES_BY_SURFACE.programmatic] } };
}

/** Which paying credential a budget and its usage belong to. */
export type UsageCredentialSource = "own" | "hosted";

/**
 * Confirmed usage comes only from settled ledger rows. A row counts as
 * confirmed when its measurement settled ("recorded") and, for native units,
 * it carries a measured quantity. Everything else is reported separately as
 * unconfirmed so callers never present a partial sum as complete.
 *
 * Own keys and credits are always counted apart, never added together: rows
 * recorded with the project's own key consume the provider costCents in the
 * catalog unit, and rows recorded on credits consume their charged priceCents
 * (always cents). A recorded credits row without a price is unconfirmed, never
 * zero and never the provider cost. A known price of zero is confirmed.
 */
export async function aggregateConnectionUsage(
  db: ConnectionUsageClient,
  input: {
    connectionId: string;
    credentialSource: UsageCredentialSource;
    now?: Date;
    projectId: string;
    surface?: ProviderRequestSurface;
    unit: ProviderAllocationUnit;
  },
): Promise<ConnectionUsage> {
  const sourceFilter = surfaceSourceFilter(input.surface);
  const where = {
    cached: false,
    connectionId: input.connectionId,
    createdAt: monthUtcRange(input.now),
    credentialSource: input.credentialSource,
    projectId: input.projectId,
    ...(sourceFilter ?? {}),
  };
  if (input.credentialSource === "hosted") {
    const [confirmed, unconfirmedCount] = await Promise.all([
      db.providerCostEntry.aggregate({
        _count: { _all: true },
        _sum: { priceCents: true },
        where: { ...where, measurementStatus: "recorded", priceCents: { not: null } },
      }),
      db.providerCostEntry.count({
        where: {
          ...where,
          AND: [{ OR: [{ measurementStatus: { not: "recorded" } }, { priceCents: null }] }],
        },
      }),
    ]);
    return {
      requestCount: confirmed._count._all + unconfirmedCount,
      unconfirmedCount,
      used: number(confirmed._sum.priceCents),
    };
  }
  if (input.unit === "units") {
    const [confirmed, unconfirmedCount] = await Promise.all([
      db.providerCostEntry.aggregate({
        _count: { _all: true },
        _sum: { costCents: true, usageQuantity: true },
        where: { ...where, measurementStatus: "recorded", usageQuantity: { not: null } },
      }),
      db.providerCostEntry.count({
        where: {
          ...where,
          AND: [
            {
              OR: [{ measurementStatus: { not: "recorded" } }, { usageQuantity: null }],
            },
          ],
        },
      }),
    ]);
    return {
      requestCount: confirmed._count._all + unconfirmedCount,
      unconfirmedCount,
      used: number(confirmed._sum.usageQuantity),
    };
  }
  const [confirmed, unconfirmedCount] = await Promise.all([
    db.providerCostEntry.aggregate({
      _count: { _all: true },
      _sum: { costCents: true },
      where: { ...where, measurementStatus: "recorded" },
    }),
    db.providerCostEntry.count({
      where: { ...where, measurementStatus: { not: "recorded" } },
    }),
  ]);
  return {
    requestCount: confirmed._count._all + unconfirmedCount,
    unconfirmedCount,
    used: number(confirmed._sum.costCents),
  };
}
