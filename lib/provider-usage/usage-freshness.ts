import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  PROVIDER_USAGE_OVERDUE_THRESHOLD_MS,
  PROVIDER_USAGE_RECONCILED_AT_SETTING_KEY,
} from "./reconcile";

export type ProviderUsageFreshness = {
  lastReconciledAt: string | null;
  status: "fresh" | "stale";
};

type ProviderUsageFreshnessClient = {
  instanceSetting: Pick<Prisma.TransactionClient["instanceSetting"], "findUnique">;
};

export async function providerUsageFreshness(
  client: ProviderUsageFreshnessClient = prisma,
  options: { now?: Date } = {},
): Promise<ProviderUsageFreshness> {
  const setting = await client.instanceSetting.findUnique({
    select: { value: true },
    where: { key: PROVIDER_USAGE_RECONCILED_AT_SETTING_KEY },
  });
  const value = setting?.value ?? null;
  if (value === null) return { lastReconciledAt: null, status: "stale" };
  const reconciledAt = Date.parse(value);
  const nowMs = (options.now ?? new Date()).getTime();
  // An unparseable or future watermark is invalid: never surface it as a
  // reconciliation timestamp, and never treat it as fresh.
  if (Number.isNaN(reconciledAt) || reconciledAt > nowMs) {
    return { lastReconciledAt: null, status: "stale" };
  }
  const elapsedMs = nowMs - reconciledAt;
  return {
    lastReconciledAt: value,
    status: elapsedMs > PROVIDER_USAGE_OVERDUE_THRESHOLD_MS ? "stale" : "fresh",
  };
}
