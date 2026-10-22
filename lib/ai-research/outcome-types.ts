import type {
  ActionPaymentOption,
  ActionPaymentQuote,
  ActionPaymentReceipt,
} from "@/lib/action-payment/contract";
import type { ProviderRequestOrigin } from "@/lib/provider-usage/surface";
import type { ProviderRequestTrigger } from "@/lib/provider-usage/tag";
import type { AiResearchResult } from "./types";

export type AiResearchContext = {
  projectId: string;
  actorId?: string | null;
  origin: ProviderRequestOrigin;
  execution?: { trigger: ProviderRequestTrigger; correlationId: string };
};
export type AiResearchOutcome =
  | {
      ok: true;
      estimate: true;
      estimatedCostCents: number;
      evidence: AiResearchResult["evidence"];
      estimateKind?: "forecast" | "admission_bound";
      isGuaranteedMaximum?: boolean;
      credentialSource?: "own" | "hosted";
      estimateCredentialsRef?: string;
      forecastAssumptions?: string[];
      forecastScope?: "tokens_and_base_only";
      pricingPolicy?: string;
      pricingCheckedAt?: string;
      isPartialEstimate?: boolean;
      forecastExclusions?: string[];
      payment?: ActionPaymentQuote;
      paymentOptions?: ActionPaymentOption[];
    }
  | {
      ok: true;
      estimate: false;
      cached: boolean;
      reportId: string;
      costCents: number;
      result: AiResearchResult;
      retryBlocked?: boolean;
      safeToStartNewRequest?: boolean;
      payment?: ActionPaymentReceipt;
      originalPayment?: ActionPaymentReceipt;
    }
  | {
      ok: false;
      estimatedCostCents?: number;
      reason: string;
      message: string;
      retryBlocked?: boolean;
      safeToStartNewRequest?: boolean;
      payment?: ActionPaymentReceipt;
      originalPayment?: ActionPaymentReceipt;
    };
