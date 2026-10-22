import "server-only";
import type { PaidCallPayment } from "@/lib/action-payment/paid-call";
import type { SnapshotDefinitionSession } from "@/lib/measurement-definitions/snapshot-dispatch";
import type { DefinitionExecutionPermit } from "@/lib/measurement-definitions/worker-claim";
import type { PaidFenceHook } from "@/lib/metering/paid-attempt-types";
import type { ResolveProviderRateInput } from "@/lib/provider-rates/resolver";
import type { ProviderRequestAttribution } from "@/lib/provider-usage/tag";
import type { ProviderCredentials, SerpDevice, SerpProvider } from "@/lib/providers/types";
import type { SerpDepth } from "@/lib/serp/constants";
import type { SerpRankLocation } from "@/lib/serp/location";
import type { RankCheckScheduleInput } from "./schedule";

export type RankCheckKeywordInput = {
  id: string;
  text: string;
  location: SerpRankLocation;
  device: SerpDevice;
  domain: string;
};

export type RankCheckConnectionInput = {
  publicId?: string;
  id?: string;
  provider: string;
  costPerCheckCents?: unknown;
  credentials?: ProviderCredentials;
  credentialsEncrypted?: string | null;
  credentialSource?: string;
  updatedAt?: Date;
  rateContext?: Pick<ResolveProviderRateInput, "entries" | "manualAmountCents">;
};

export type RunCheckInput = {
  payment?: PaidCallPayment;
  definitionContinuation?: SnapshotDefinitionSession;
  definitionBeforeReserve?: SnapshotDefinitionSession["beforeReserve"];
  definitionPermit?: DefinitionExecutionPermit;
  /** Native trusted callback, composed by the runner; never a public request field. */
  definitionFence?: PaidFenceHook;
  comparisonAllowed?: boolean;
  keyword: RankCheckKeywordInput;
  schedule: RankCheckScheduleInput;
  connection: RankCheckConnectionInput;
  depth?: SerpDepth;
  stopOnMatch?: boolean;
  provider?: SerpProvider;
  previousPosition?: number | null;
  completedCheckCount?: number;
  now?: Date;
  /** Owning project id; only used as the provider rate-limit fallback key. */
  projectId?: string;
  providerUsage?: ProviderRequestAttribution;
  rankCheckId?: string;
};
