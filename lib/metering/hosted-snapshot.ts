import type { ProviderRequestSource } from "@/lib/provider-usage/tag";

/** Neutral immutable identity supplied by the host's retained execution record. */
export type HostedMeteringSnapshot = {
  schemaVersion: 1;
  /** Missing on historical executions; their namespace cannot be inferred from today's env. */
  namespace?: string;
  operationKey: string;
  ownerId: string;
  walletId: string;
  projectId: string;
  connectionId: string;
  provider: string;
  feature: string;
  source: ProviderRequestSource;
  credentialKind: string | null;
  credentialId: string | null;
  correlationId: string;
  occurredAt: string;
  estimatedCostCents: string;
  estimatedPriceCents: string;
  estimatedQuantity: string;
  customerPriceVersion: string;
  platformPoolId: string | null;
  providerCredentialVersion: string | null;
  providerCostOwner: string | null;
};

/** Provider evidence and customer debit remain distinct exact quantities. */
export type HostedMeteringEvidence = {
  snapshot: HostedMeteringSnapshot;
  costCents: string | null;
  usageQuantity: string | null;
  customerCents: string | null;
  failed: boolean;
  cached: boolean;
};
