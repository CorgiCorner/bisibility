import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { settingsHash } from "@/lib/measurement-settings/host/hash";
import { usesCronOccurrences } from "@/lib/rank-check/planner/occurrence";
import { serpProviderChainOrderBy } from "@/lib/rank-check/provider-chain-order";
import { scheduleNotFound } from "./errors";
import type { ReviewCadence } from "./review-cost";
import type { ScheduleSpend, SpendQuote } from "./review-decision";

export const rankSelect = {
  archivedAt: true,
  cronExpression: true,
  enabled: true,
  frequency: true,
  jitterMinutes: true,
  measurementEpoch: true,
  providerPolicy: true,
  publicId: true,
  serpDepth: true,
  timeOfDay: true,
  timezone: true,
  updatedAt: true,
} as const;

export function scheduleRevision(parts: readonly unknown[]) {
  const hex = settingsHash("schedule-review-revision", parts);
  const value = BigInt(`0x${hex}`);
  return value === 0n ? "0" : value.toString(10);
}

export function quote(
  cadence: ReviewCadence | null,
  members: number,
  unitCents: number | null,
): SpendQuote {
  return { cadence, members, unitCents };
}

export function idle(): SpendQuote {
  return quote(null, 0, 0);
}

export type ReviewGuard =
  | { kind: "transfer"; change: import("./review-load-transfers").TransferChange }
  | {
      kind: "keywords-create";
      change: import("@/lib/schemas/keyword-create-review").KeywordCreateChange;
    }
  | { kind: "none" }
  | { kind: "ai"; publicId: string }
  | { keywordPublicIds: readonly string[]; kind: "keywords"; schedulePublicId: string | null }
  | { kind: "schedule"; publicId: string };

export function pack(
  projectDepth: number,
  now: Date,
  operation: string,
  before: SpendQuote,
  after: SpendQuote,
  manualToScheduled: boolean,
  providerBefore: string | null,
  providerAfter: string | null,
  revisionParts: readonly unknown[],
  guard: ReviewGuard = { kind: "none" },
) {
  const spend: ScheduleSpend = {
    after,
    before,
    manualToScheduled,
    now,
    operation,
    projectDepth,
    providerAfter,
    providerBefore,
  };
  return {
    bindingChange: undefined as import("./review-load").ScheduleChange | undefined,
    guard,
    revision: scheduleRevision(revisionParts),
    spend,
  };
}

export async function rankRow(
  projectId: string,
  publicId: string,
  db: Prisma.TransactionClient = prisma,
) {
  const row = await db.checkSchedule.findFirst({
    select: rankSelect,
    where: { projectId, publicId },
  });
  if (!row) throw scheduleNotFound();
  return row;
}

export function asCadence(
  row: {
    archivedAt: Date | null;
    cronExpression: string | null;
    enabled: boolean;
    frequency: ReviewCadence["frequency"];
    jitterMinutes: number;
    publicId: string;
    serpDepth: number | null;
    timeOfDay: string | null;
    timezone: string | null;
  },
  timezone: string,
  patch?: {
    cronExpression?: string | null;
    enabled?: boolean;
    frequency?: ReviewCadence["frequency"];
    jitterMinutes?: number;
    serpDepth?: number | null;
    timeOfDay?: string | null;
    timezone?: string | null;
  },
): ReviewCadence {
  const frequency = patch?.frequency ?? row.frequency;
  // A weekly or monthly update keeps the stored cron unless it supplies one (storedCronExpression).
  // A missing value means no cron, exactly like null, so it never reads as a custom schedule.
  const cronExpression =
    (patch?.cronExpression === undefined ? row.cronExpression : patch.cronExpression) ?? null;
  const cadence: ReviewCadence = {
    archived: Boolean(row.archivedAt),
    cronExpression,
    enabled: patch?.enabled ?? row.enabled,
    frequency,
    jitterMinutes: patch?.jitterMinutes ?? row.jitterMinutes,
    publicId: row.publicId,
    serpDepth:
      patch && "serpDepth" in patch && patch.serpDepth !== undefined
        ? patch.serpDepth
        : row.serpDepth,
    timeOfDay: patch?.timeOfDay === undefined ? row.timeOfDay : patch.timeOfDay,
    timezone: (patch?.timezone === undefined ? row.timezone : patch.timezone) ?? timezone,
  };
  // Price exactly what the planner runs: a weekly or monthly schedule with a stored cron fires
  // on that cron (usesCronOccurrences), so it is quoted as one.
  return usesCronOccurrences(cadence)
    ? { ...cadence, frequency: "custom_cron" }
    : { ...cadence, cronExpression: null };
}

/**
 * First connected search provider. Same filter and order as `loadFromDatabase`
 * in `lib/rank-check/provider-chain-loader.ts`: enabled, kind serp, status
 * connected, priority then provider ascending. `findFirst` is the first row of
 * that `findMany`.
 */
export async function projectSerpProviderId(
  client: Pick<Prisma.TransactionClient, "providerConnection">,
  projectId: string,
) {
  const row = await client.providerConnection.findFirst({
    orderBy: serpProviderChainOrderBy(),
    select: { provider: true },
    where: { enabled: true, kind: "serp", projectId, status: "connected" },
  });
  return row?.provider ?? null;
}

export async function memberCount(
  projectId: string,
  schedulePublicId: string,
  db: Prisma.TransactionClient = prisma,
) {
  return db.keyword.count({
    where: {
      archivedAt: null,
      checkSchedule: { projectId, publicId: schedulePublicId },
      projectId,
    },
  });
}
