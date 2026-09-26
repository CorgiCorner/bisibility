import { projectedMonthlySpendCents } from "@/lib/cost-estimate/spend-pace";
import { monthStartUtc } from "@/lib/rank-check/budget";

export type SurfaceAllocation = { amountPerMonth: number; unit: "cents" | "units" } | null;

export type SurfaceSpendState = "ok" | "capped" | "no_allocation";

export type SurfaceSpend = {
  allocation: SurfaceAllocation;
  projectedExhaustionAt: string | null;
  remaining: number | null;
  /** Requests this month on this surface, confirmed or not. */
  requestCount?: number;
  state: SurfaceSpendState;
  /** Requests whose measurement has not settled; `used` is a confirmed partial then. */
  unconfirmedCount?: number;
  used: number;
  usedPercent: number | null;
};

export type SurfaceSpendInput = {
  allocation: SurfaceAllocation;
  now: Date;
  requestCount: number;
  unconfirmedCount?: number;
  used: number;
};

export type SurfaceTightestEntry = {
  connectionId: string;
  provider: string;
  source: "own" | "credits";
  surface: "app" | "programmatic";
  usedPercent: number;
};

export function projectedExhaustionAt(allocation: SurfaceAllocation, used: number, now: Date) {
  if (!allocation || used <= 0) return null;
  const projected = projectedMonthlySpendCents(used, now);
  if (projected === null || projected <= allocation.amountPerMonth) return null;

  const elapsedDays = now.getUTCDate();
  const monthlyStart = monthStartUtc(now);
  const exhaustion = new Date(
    (allocation.amountPerMonth * elapsedDays * 86_400_000) / used + monthlyStart.getTime(),
  );
  return exhaustion.toISOString();
}

export function surfaceSpend(input: SurfaceSpendInput): SurfaceSpend {
  const { allocation, used, now, requestCount } = input;
  const unconfirmedCount = input.unconfirmedCount ?? 0;
  if (!allocation) {
    return {
      allocation: null,
      projectedExhaustionAt: null,
      remaining: null,
      requestCount,
      state: "no_allocation",
      unconfirmedCount,
      used,
      usedPercent: null,
    };
  }
  const usedPercent = Math.min(100, (used / allocation.amountPerMonth) * 100);
  return {
    allocation,
    projectedExhaustionAt: projectedExhaustionAt(allocation, used, now),
    remaining: allocation.amountPerMonth - used,
    requestCount,
    state: usedPercent >= 100 ? "capped" : "ok",
    unconfirmedCount,
    used,
    usedPercent,
  };
}

/** The row state from the two surfaces alone, before connection-level escalation. */
export function worseSurfaceState(surfaces: {
  app: SurfaceSpend;
  programmatic: SurfaceSpend;
}): SurfaceSpendState {
  if (surfaces.app.state === "capped" || surfaces.programmatic.state === "capped") {
    return "capped";
  }
  if (surfaces.app.state === "ok" || surfaces.programmatic.state === "ok") return "ok";
  return "no_allocation";
}

export function surfaceTightestEntries(
  connection: {
    connectionId: string;
    provider: string;
    surfaces: { app: SurfaceSpend; programmatic: SurfaceSpend };
  },
  source: SurfaceTightestEntry["source"] = "own",
): SurfaceTightestEntry[] {
  return (["app", "programmatic"] as const).flatMap((surface) => {
    const usedPercent = connection.surfaces[surface].usedPercent;
    return usedPercent === null
      ? []
      : [
          {
            connectionId: connection.connectionId,
            provider: connection.provider,
            source,
            surface,
            usedPercent,
          },
        ];
  });
}

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function monthLabel(date: Date) {
  return `${MONTH_LABELS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}
