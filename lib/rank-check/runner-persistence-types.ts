import type { Prisma } from "@/lib/generated/prisma/client";
import type { SerpDepth } from "@/lib/serp/markets";

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
  existingRankCheckId?: string;
  previousRaw?: Prisma.JsonValue | null;
  previousRankingUrl?: string | null;
  keywordTargetUrl?: string | null;
  persistenceFinalize?: RankCheckPersistenceFinalize;
  persistenceGuard?: RankCheckPersistenceGuard;
  transactionOptions?: RankCheckTransactionOptions;
};

export type RankCheckFailureTarget = {
  attempts?: RankCheckAttempt[];
  connectionId?: string;
  error: string;
  existingRankCheckId?: string;
  keywordId: string;
  keywordPublicId: string;
  keywordText?: string;
  previousPosition?: number | null;
  projectDomain?: string;
  projectId?: string;
  provider: string;
  providerCostCents?: number;
  requestedDepth?: SerpDepth;
  checkedAt?: Date;
  persistenceFinalize?: RankCheckPersistenceFinalize;
  persistenceGuard?: RankCheckPersistenceGuard;
  transactionOptions?: RankCheckTransactionOptions;
};
