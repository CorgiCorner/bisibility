import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { normalizeGscProperty } from "@/lib/providers/analytics/gsc-property";
import { nextPacificMidnight, pacificDate } from "@/lib/providers/pacific-reset";
import { ProviderRateLimitedError } from "@/lib/providers/rate-limit-error";
import type { InspectionBudgetMode } from "./budget-mode";
import { MAX_INSPECTION_DAILY_LIMIT } from "./constants";

// Non-secret property identity; OAuth grants do not change the quota owner.
export function propertyQuotaKey(property: string) {
  return `gsc:property:${createHash("sha256").update(normalizeGscProperty(property)).digest("hex").slice(0, 16)}`;
}

export async function readPropertyQuota(accountKey: string, now = new Date()) {
  const row = await prisma.inspectionPropertyQuota.findUnique({ where: { accountKey } });
  return {
    todayCount: row?.pacificDate === pacificDate(now) ? row.used : 0,
    last429Kind: row?.last429Kind ?? null,
    last429At: row?.last429At ?? null,
    nextResetAt: nextPacificMidnight(now),
  };
}

async function lockedQuota(tx: Prisma.TransactionClient, accountKey: string, now: Date) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`inspection-property:${accountKey}`}))`;
  const row = await tx.inspectionPropertyQuota.upsert({
    where: { accountKey },
    update: {},
    create: { accountKey, pacificDate: pacificDate(now) },
  });
  // A caller queued before midnight must not rewind a counter already advanced by another caller.
  if (row.pacificDate >= pacificDate(now)) return row;
  return tx.inspectionPropertyQuota.update({
    where: { accountKey },
    data: { pacificDate: pacificDate(now), used: 0 },
  });
}

// Admission is atomic across projects and manual/background workers. Retries are provider calls too.
export async function startPropertyInspection(
  accountKey: string,
  mode: InspectionBudgetMode,
  now = new Date(),
) {
  const allowed = await prisma.$transaction(async (tx) => {
    const row = await lockedQuota(tx, accountKey, now);
    if (
      (row.dailyStoppedUntil && row.dailyStoppedUntil > now) ||
      (mode !== "available_quota" && row.used >= MAX_INSPECTION_DAILY_LIMIT)
    )
      return false;
    await tx.inspectionPropertyQuota.update({
      where: { accountKey },
      data: { used: { increment: 1 } },
    });
    return true;
  });
  if (!allowed)
    throw new ProviderRateLimitedError("gsc", {
      accountKey,
      scope: "daily",
      source: "local",
      resetAt: nextPacificMidnight(now).getTime(),
      message: "Shared property inspection allowance reached; wait until Pacific midnight.",
    });
}

export async function recordProperty429(accountKey: string, error: unknown, now = new Date()) {
  if (!(error instanceof ProviderRateLimitedError) || error.source !== "provider") return;
  await prisma.$transaction(async (tx) => {
    await lockedQuota(tx, accountKey, now);
    await tx.inspectionPropertyQuota.update({
      where: { accountKey },
      data: {
        last429Kind: error.scope,
        last429At: now,
        resetAt: error.scope === "daily" ? nextPacificMidnight(now) : new Date(error.resetAt),
        ...(error.scope === "daily" ? { dailyStoppedUntil: nextPacificMidnight(now) } : {}),
      },
    });
  });
}
