import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma, ProviderCostFeature } from "@/lib/generated/prisma/client";
import { syncUsageEntry } from "@/lib/metering/entry-sync";
import type { ProviderCredentialKind } from "./surface";
import type { ProviderRequestAttribution } from "./tag";

type RecorderClient = {
  providerCostEntry: Pick<Prisma.TransactionClient["providerCostEntry"], "createMany">;
};
export type ProviderUsageRecordInput = {
  id?: string;
  cached?: boolean;
  measurementStatus?: "recorded" | "unknown";
  createdAt?: Date;
  attribution: ProviderRequestAttribution;
  connectionId: string;
  costCents: number;
  credentialId?: string | null;
  credentialKind?: ProviderCredentialKind | null;
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

function quantity(value: number | null | undefined, field: string) {
  if (value == null) return null;
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${field} must be nonnegative.`);
  return value;
}

export async function recordProviderUsage(client: RecorderClient, input: ProviderUsageRecordInput) {
  const context = input.attribution.context;
  if (input.projectId && input.projectId !== context.projectId) {
    throw new Error("Provider attribution project identity does not match the trusted project id.");
  }
  const costCents = nonnegative(input.costCents, "Provider cost");
  const usageQuantity = quantity(input.usageQuantity, "Provider usage quantity");
  if (costCents === 0 && usageQuantity === null && !input.measurementStatus)
    return { status: "skipped" as const };
  const data = {
    id: input.id ?? randomUUID(),
    ...(input.measurementStatus ? { measurementStatus: input.measurementStatus } : {}),
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    cached: input.cached ?? false,
    connectionId: input.connectionId,
    correlationId: context.correlationId,
    costCents,
    credentialId: input.credentialId ?? input.attribution.credential?.id ?? undefined,
    credentialKind: input.credentialKind ?? input.attribution.credential?.kind ?? undefined,
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
  if (result.count > 0 && input.measurementStatus !== "unknown") await syncUsageEntry(data.id);
  return { status: result.count === 0 ? ("duplicate" as const) : ("recorded" as const) };
}
