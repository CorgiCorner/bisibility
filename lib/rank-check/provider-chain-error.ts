import type { BudgetExhaustedError } from "@/lib/metering/admission-errors";
import type { ProviderRequestSurface } from "@/lib/provider-usage/surface";
import type { RecoveryAdmissionReason } from "@/lib/providers/account-health/types";
import type { DeploymentAdmissionExhaustedError } from "@/lib/providers/execution-extension-errors";
import { dominantErrorCode, type ProviderErrorCode } from "@/lib/providers/provider-error-code";
import { RankCheckRunnerError } from "./runner-error";

export type FallbackAttempt = {
  provider: string;
  message: string;
  code?: ProviderErrorCode;
  reason?: "allocation_exhausted" | "funding_exhausted" | "account_blocked" | "provider_failed";
  surface?: ProviderRequestSurface;
  recoveryReason?: RecoveryAdmissionReason;
};

export class ProviderChainError extends RankCheckRunnerError {
  readonly dominantCode: ProviderErrorCode;
  readonly deferralReason: "provider_account_blocked" | "usage_unconfirmed" | null;

  constructor(
    readonly attempts: FallbackAttempt[],
    readonly admissionExhaustion?: DeploymentAdmissionExhaustedError,
    readonly fundingExhaustion?: BudgetExhaustedError,
  ) {
    super(
      "provider_failed",
      `All SERP providers failed: ${attempts.map((attempt) => `${attempt.provider} (${attempt.message})`).join("; ")}`,
    );
    this.name = "ProviderChainError";
    this.deferralReason =
      attempts.length > 0 && attempts.every((attempt) => attempt.reason === "account_blocked")
        ? attempts.some((attempt) => attempt.recoveryReason === "account_blocked")
          ? "provider_account_blocked"
          : "usage_unconfirmed"
        : null;
    this.dominantCode = dominantErrorCode(
      attempts.map((attempt) => attempt.code ?? "provider_transient"),
    );
  }
}
