import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { GscUrlInspectionResult } from "@/lib/providers/analytics/gsc";
import { emitSignal } from "@/lib/signals/emit";
import { SIGNAL_TYPES } from "@/lib/signals/types";
import { normalizedCanonicalUrl } from "./url";

export type PresenceRow = {
  canonicalOk: boolean | null;
  checkedAt: Date;
  coverageState: string | null;
  lastCrawlAt: Date | null;
  url: string;
  verdict: string | null;
};

export function canonicalOk(result: GscUrlInspectionResult) {
  const googleCanonical = normalizedCanonicalUrl(result.googleCanonical);
  const userCanonical = normalizedCanonicalUrl(result.userCanonical);
  return googleCanonical && userCanonical ? googleCanonical === userCanonical : null;
}

function isIndexed(verdict: string | null | undefined) {
  return verdict === "PASS";
}

function signalForTransition(previous: PresenceRow, next: GscUrlInspectionResult) {
  const wasIndexed = isIndexed(previous.verdict);
  const nowIndexed = isIndexed(next.verdict);
  if (wasIndexed === nowIndexed) return null;
  return nowIndexed
    ? { severity: "info" as const, type: SIGNAL_TYPES.urlIndexed }
    : { severity: "warning" as const, type: SIGNAL_TYPES.urlDeindexed };
}

function payload(result: GscUrlInspectionResult, canonical: boolean | null) {
  return {
    canonicalOk: canonical,
    coverageState: result.coverageState,
    lastCrawlAt: result.lastCrawlAt?.toISOString() ?? null,
    verdict: result.verdict,
  } satisfies Prisma.InputJsonValue;
}

export async function persistPresence(input: {
  canonical: boolean | null;
  inspection: GscUrlInspectionResult;
  now: Date;
  previous?: PresenceRow;
  projectId: string;
  url: string;
}) {
  const data = {
    canonicalOk: input.canonical,
    checkedAt: input.now,
    coverageState: input.inspection.coverageState,
    lastCrawlAt: input.inspection.lastCrawlAt,
    verdict: input.inspection.verdict,
  };
  const upsert = {
    create: { ...data, projectId: input.projectId, url: input.url },
    update: data,
    where: { projectId_url: { projectId: input.projectId, url: input.url } },
  };
  const transition = input.previous ? signalForTransition(input.previous, input.inspection) : null;
  if (!transition) {
    await prisma.urlPresence.upsert(upsert);
    return false;
  }

  await prisma.$transaction(async (tx) => {
    await tx.urlPresence.upsert(upsert);
    await emitSignal(
      {
        happenedAt: input.now,
        payload: payload(input.inspection, input.canonical),
        projectId: input.projectId,
        severity: transition.severity,
        source: "url_inspection",
        type: transition.type,
        url: input.url,
      },
      tx,
    );
  });
  return true;
}
