import type { Prisma } from "@/lib/generated/prisma/client";
import type { ProviderRequestAttribution } from "@/lib/provider-usage/tag";
import type { SerpDepth } from "@/lib/serp/constants";

export type RankCheckAttempt = {
  provider: string;
  message: string;
};

type RankCheckPersistenceGuard = (tx: Prisma.TransactionClient) => Promise<void>;
type RankCheckPersistenceFinalize = (tx: Prisma.TransactionClient) => Promise<void>;

export type RankCheckTransactionOptions = {
  maxWait: number;
  timeout: number;
};

export type RankCheckPersistTarget = {
  attempts?: RankCheckAttempt[];
  keywordId: string;
  keywordPublicId: string;
  projectId: string;
  hasSchedule: boolean;
  hasDefaults: boolean;
  connectionId?: string;
  providerRequestId?: string;
  providerUsage?: ProviderRequestAttribution;
  existingRankCheckId?: string;
  previousRaw?: Prisma.JsonValue | null;
  previousRankingUrl?: string | null;
  expectedUrlAtCheck?: string | null;
  keywordTargetUrl?: string | null;
  persistenceFinalize?: RankCheckPersistenceFinalize;
  persistenceGuard?: RankCheckPersistenceGuard;
  transactionOptions?: RankCheckTransactionOptions;
};

export type RankCheckFailureTarget = {
  attempts?: RankCheckAttempt[];
  connectionId?: string;
  error: string;
  expectedUrlAtCheck?: string | null;
  existingRankCheckId?: string;
  keywordId: string;
  keywordPublicId: string;
  keywordText?: string;
  previousPosition?: number | null;
  projectDomain?: string;
  projectId?: string;
  provider: string;
  providerRequestId?: string;
  providerCostCents?: number;
  providerUsage?: ProviderRequestAttribution;
  requestedDepth?: SerpDepth;
  checkedAt?: Date;
  persistenceFinalize?: RankCheckPersistenceFinalize;
  persistenceGuard?: RankCheckPersistenceGuard;
  transactionOptions?: RankCheckTransactionOptions;
};
