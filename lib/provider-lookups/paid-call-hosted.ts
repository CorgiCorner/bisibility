import "server-only";
import { randomUUID } from "node:crypto";
import type { ProviderCostFeature } from "@/lib/generated/prisma/client";
import type { RequestCostLimit } from "@/lib/provider-usage/request-cost-limit";
import type { ProviderCredential } from "@/lib/provider-usage/surface";
import {
  createProviderRequestAttribution,
  type ProviderRequestAttribution,
  type ProviderRequestSource,
  type ProviderRequestTrigger,
} from "@/lib/provider-usage/tag";
import type { resolveProviderCredentials } from "@/lib/providers/credentials";
import type { SerpProvider } from "@/lib/providers/types";
import { runDeploymentPaidCall } from "./paid-call-deployment";

/** Hosted-credential paid lookups: frozen deployment execution and wallet-backed Meter admission. */
export async function runHostedPaidProviderCall<
  T extends { costCents: number; providerRequestId?: string; usageQuantity?: number },
>(input: {
  call: (
    credentials: ReturnType<typeof resolveProviderCredentials>,
    usage: ProviderRequestAttribution,
  ) => Promise<T>;
  connection: { credentialsEncrypted: string | null; id: string; provider: string };
  credential?: ProviderCredential;
  correlationId?: string;
  feature: Exclude<ProviderCostFeature, "rank_check">;
  itemCount: number;
  projectId: string;
  provider: SerpProvider;
  source: ProviderRequestSource;
  trigger: ProviderRequestTrigger;
  estimatedCostCents: number;
  maxCostCents?: number;
  costLimit?: RequestCostLimit;
}): Promise<T> {
  const usage = await createProviderRequestAttribution(
    {
      correlationId: input.correlationId ?? randomUUID(),
      feature: input.feature,
      projectId: input.projectId,
      source: input.source,
      trigger: input.trigger,
    },
    input.credential,
    "hosted",
  );
  return runDeploymentPaidCall({
    attribution: usage,
    call: input.call,
    connectionId: input.connection.id,
    credential: input.credential,
    estimatedCostCents: input.estimatedCostCents,
    estimatedQuantity: input.itemCount,
    provider: input.provider.id,
    maxCostCents: input.maxCostCents,
    costLimit: input.costLimit,
  });
}
