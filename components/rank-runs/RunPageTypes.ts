import type { ActionPaymentReceipt } from "@/lib/action-payment/contract";
import type { DeferralReasonCode } from "@/lib/rank-check/deferral-reason";
import type { ItemStatus, RankCheckOperation } from "@/lib/rank-check/runs/contract";

export type RunPageData = RankCheckOperation & {
  rankedCount?: number;
  executedProviders?: string[];
  childRuns?: { publicId: string; parentRelation: string | null }[];
  checkSchedulePublicId: string | null;
  launchedAt: string | null;
  parentRelation: string | null;
  parentRunPublicId: string | null;
  requestedBy: { name: string | null } | null;
  selectionSpec: unknown;
  hasAccountDeferred?: boolean;
  connectionNotice?: { provider: string; state: "unverified" | "verified" } | null;
  sharedDeferralCode?: DeferralReasonCode | null;
  skippedBy: { name: string } | null;
};

export type RunPageItem = {
  accountBlocks?: import("@/lib/integrations/provider-recovery/types").RunAccountBlock[];
  deferralCode?: DeferralReasonCode | null;
  payment?: ActionPaymentReceipt;
  actualCostCents: number | null;
  blockedReason: string | null;
  estimatedCostCents: number | null;
  finishedAt: string | null;
  id: string;
  keyword: {
    device: string;
    languageLabel: string | null;
    location: string;
    publicId: string;
    text: string;
  };
  notBefore: string | null;
  rankCheck: {
    evidenceProjection?:
      | import("@/lib/provider-evidence/projection/model").EvidenceProjection
      | null;
    attempts?: import("@/lib/checks/contract").CheckAttempt[];
    observationCompleteness?: string | null;
    organicCoverageDepth?: number | null;
    billingUnits?: number | null;
    provider?: string;
    requestedDepth?: number | null;
    errorCode: string | null;
    position: number | null;
    publicId: string;
    rankingUrl: string | null;
  } | null;
  startedAt: string | null;
  status: ItemStatus;
};

export type RunPageInitialData = {
  items: RunPageItem[];
  nextCursor: string | null;
  now: string;
  run: RunPageData;
};
