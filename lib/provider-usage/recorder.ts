import "server-only";

import type { Prisma, ProviderCostFeature } from "@/lib/generated/prisma/client";
import type { ProviderRequestAttribution } from "./tag";

type RecorderClient = {
  providerCostEntry: Pick<Prisma.TransactionClient["providerCostEntry"], "createMany">;
};
export type ProviderUsageRecordInput = {
  attribution: ProviderRequestAttribution;
  connectionId: string;
  costCents: number;
  failed: boolean;
  keywordId?: string;
  projectId?: string;
  provider: string;
  providerRequestId?: string;
  unitCostCents?: number | null;
  usageQuantity?: number | null;
};

function nonnegative(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${field} must be nonnegative.`);
  return value;
}

function positive(value: number | null | undefined, field: string) {
  if (value == null) return null;
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${field} must be positive.`);
  return value;
}

export async function recordProviderUsage(client: RecorderClient, input: ProviderUsageRecordInput) {
  const context = input.attribution.context;
  if (input.projectId && input.projectId !== context.projectId) {
    throw new Error("Provider attribution project identity does not match the trusted project id.");
  }
  const costCents = nonnegative(input.costCents, "Provider cost");
  const usageQuantity = positive(input.usageQuantity, "Provider usage quantity");
  if (costCents === 0 && usageQuantity === null) return { status: "skipped" as const };
  const data = {
    cached: false,
    connectionId: input.connectionId,
    correlationId: context.correlationId,
    costCents,
    failed: input.failed,
    feature: context.feature as ProviderCostFeature,
    keywordId: input.keywordId,
    projectId: context.projectId,
    provider: input.provider,
    providerRequestId: input.providerRequestId,
    source: context.source,
    tag: input.attribution.tag,
    trigger: context.trigger,
    unitCostCents: input.unitCostCents ?? undefined,
    usageQuantity: usageQuantity ?? undefined,
  };
  const result = await client.providerCostEntry.createMany({ data: [data], skipDuplicates: true });
  return { status: result.count === 0 ? ("duplicate" as const) : ("recorded" as const) };
}
