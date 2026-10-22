import type { NativeUsageEstimate } from "@/lib/cost-estimate/native-usage";
import type { HostPolicySnapshot } from "@/lib/measurement-definitions/host-policy-contract";
import type { ProviderRequestOrigin, ProviderRequestSurface } from "@/lib/provider-usage/surface";
import type { UnrunnableReason } from "@/lib/rank-check/runnable-reasons";
import type { SerpDepth } from "@/lib/serp/constants";
import type { RankCheckRunProject } from "./launch-types";
import type { RankCheckRunOverlap } from "./preview-overlaps";
import type { RunLaunchTrigger, RunSelectionSpec } from "./selection";
export type RankCheckRunExclusionReason =
  | "paused"
  | "manual"
  | "in_progress"
  | "no_provider"
  | "other_project"
  | UnrunnableReason;

export type RankCheckRunPreview = {
  payment?: import("@/lib/action-payment/contract").ActionPaymentQuote;
  paymentOptions?: import("@/lib/action-payment/contract").ActionPaymentOption[];
  budget: {
    blocked: boolean;
    capCents: number | null;
    mode: "allocation" | "legacy";
    reason:
      | "budget_missing"
      | "budget_exhausted"
      | "usage_reconciliation_required"
      | "duplicate"
      | "no_provider"
      | "measurement_policy_unconfigured"
      | "measurement_policy_unsupported"
      | null;
    remainingAfterCents: number | null;
    spentCents: number | null;
    surface?: ProviderRequestSurface;
  };
  measurementPolicy?: {
    state: HostPolicySnapshot["state"];
    policyEpoch: string | null;
    configurationHref: string;
  };
  estimate: {
    native?: NativeUsageEstimate;
    costCents: number | null;
    perTargetCents: number | null;
    unknownCostTargets: number;
  };
  excluded: Array<{ keywordId: string; reason: RankCheckRunExclusionReason }>;
  executable: number;
  expiresAt: string;
  keywordCount: number;
  matched: number;
  /** Other runs that also check some of these keywords; reported for manual previews only. */
  overlapRunCount: number;
  overlaps: RankCheckRunOverlap[];
  previewToken: string;
  selectionHash: string;
  targetCount: number;
};

export type RankCheckRunPreviewInput = {
  actorId?: string | null;
  paymentOptionId?: string;
  depth?: SerpDepth;
  origin: ProviderRequestOrigin;
  project: RankCheckRunProject;
  providerId?: string;
  spec: RunSelectionSpec;
  /** The launch this preview signs for. Defaults to the protective API rule. */
  trigger?: RunLaunchTrigger;
};
