import type { ActionPaymentReceipt } from "@/lib/action-payment/contract";
import type { DeferralReasonCode } from "@/lib/rank-check/deferral-reason";
import type { ItemStatus, RankCheckOperation } from "@/lib/rank-check/runs/contract";

export type RunPageData = RankCheckOperation & {
  checkSchedulePublicId: string | null;
  launchedAt: string | null;
  parentRelation: string | null;
  parentRunPublicId: string | null;
  requestedBy: { name: string | null } | null;
  selectionSpec: unknown;
  sharedDeferralCode?: DeferralReasonCode | null;
  skippedBy: { name: string } | null;
};

export type RunPageItem = {
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
