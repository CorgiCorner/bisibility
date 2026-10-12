import type { Operation, Receipt } from "@usagekit/core";

export type LegacyUsageSource = {
  id: string;
  projectId: string;
  connectionId: string;
  provider: string | null;
  feature: string;
  source: string | null;
  trigger: string | null;
  tag: string | null;
  keywordId: string | null;
  correlationId: string | null;
  providerRequestId: string | null;
  credentialKind: string | null;
  credentialId: string | null;
  costCents: string;
  usageQuantity: string | null;
  unitCostCents: string | null;
  priceCents: string | null;
  measurementStatus: string;
  credentialSource: "own" | "hosted";
  cached: boolean;
  failed: boolean;
  createdAt: string;
};
export type HistoricalIdentity = {
  canonicalId?: string;
  namespace?: string;
  principal?: string;
  costOwner?: string;
  providerCredentialVersion?: string;
  platformPoolId?: string;
  creditAccountRef?: string;
  customerPriceVersion?: string;
  customerCents?: string;
  debitId?: string;
  estimate?: Operation["estimate"];
};
export type HistoricalReceipt = Receipt & {
  metadata: {
    legacy: LegacyUsageSource;
    debitId: string | null;
    attributed: boolean;
    chargeReplayed?: boolean;
  };
};
export type HistoricalOperation = Operation & { receipts: readonly HistoricalReceipt[] };
