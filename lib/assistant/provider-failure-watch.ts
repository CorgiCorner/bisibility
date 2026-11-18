import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { notifyOps } from "@/lib/ops/notify";
import type { Clock } from "@usagekit/store";

/**
 * A server error, 408 or lost connection before any response costs nothing (nothing arrived).
 * If a provider turns out to bill for those calls, that free path would hide real spend, so the
 * metering maintenance counts them per provider over the last hour and alerts operations when
 * they are both numerous and a large share of that provider's dispatched calls. The reaction is a
 * human one: move that provider back to the estimate.
 */
export const PROVIDER_FAILURE_WINDOW_MS = 60 * 60000;
/** Fewer zero-cost failures than this in the window is noise, whatever the share. */
export const PROVIDER_FAILURE_ALERT_MIN = 10;
/** Share of a provider's dispatched calls in the window that counts as an unusual rise. */
export const PROVIDER_FAILURE_ALERT_SHARE = 0.2;

export type ProviderFailureCount = { provider: string; failures: number; dispatched: number };

/** Providers whose zero-cost failures in the window are both numerous and a large share. */
export function unusualProviderFailures(rows: readonly ProviderFailureCount[]) {
  return rows.filter(
    (row) =>
      row.failures >= PROVIDER_FAILURE_ALERT_MIN &&
      row.dispatched > 0 &&
      row.failures / row.dispatched >= PROVIDER_FAILURE_ALERT_SHARE,
  );
}

type Options = {
  clock?: Clock;
  transaction?: <T>(body: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;
  notify?: typeof notifyOps;
};

export async function watchZeroCostProviderFailures(options: Options = {}) {
  const now = options.clock?.now() ?? new Date();
  const since = new Date(now.getTime() - PROVIDER_FAILURE_WINDOW_MS);
  const transaction =
    options.transaction ??
    (<T>(body: (tx: Prisma.TransactionClient) => Promise<T>) => prisma.$transaction(body));
  const rows = await transaction(
    (tx) =>
      tx.$queryRaw<{ provider: string; failures: bigint; dispatched: bigint }[]>`
      SELECT r.provider,
        count(*) FILTER (WHERE a.usage->>'providerFailure' = 'true') AS failures,
        count(*) AS dispatched
      FROM assistant_attempts a JOIN assistant_runs r ON r.id = a."runId"
      WHERE a."dispatchedAt" >= ${since}
      GROUP BY r.provider`,
  );
  const counts = rows.map((row) => ({
    provider: row.provider,
    failures: Number(row.failures),
    dispatched: Number(row.dispatched),
  }));
  const unusual = unusualProviderFailures(counts);
  const notify = options.notify ?? notifyOps;
  // One alert per provider per hour bucket, however often the minute sweep sees it.
  const bucket = Math.floor(now.getTime() / PROVIDER_FAILURE_WINDOW_MS);
  for (const row of unusual)
    await notify({
      dedupeKey: `assistant_provider_zero_cost_failures:${row.provider}:${bucket}`,
      kind: "assistant_provider_zero_cost_failures",
      severity: "warning",
      title: "Assistant provider failures closed at zero cost are rising",
      fields: {
        Provider: row.provider,
        Failures: String(row.failures),
        Dispatched: String(row.dispatched),
        Window: "60 minutes",
      },
    }).catch(() => console.error("[assistant] provider failure alert failed"));
  return { counts, alerted: unusual.map((row) => row.provider) };
}
