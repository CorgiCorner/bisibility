import type { ProviderRequestSurface } from "@/lib/provider-usage/surface";
import type { DeploymentAdmissionExhaustedError } from "@/lib/providers/execution-extension-errors";
import { dominantErrorCode, type ProviderErrorCode } from "@/lib/providers/provider-error-code";
import { RankCheckRunnerError } from "./runner-error";

export type FallbackAttempt = {
  provider: string;
  message: string;
  code?: ProviderErrorCode;
  reason?: "allocation_exhausted";
  surface?: ProviderRequestSurface;
};

export class ProviderChainError extends RankCheckRunnerError {
  readonly dominantCode: ProviderErrorCode;

  constructor(
    readonly attempts: FallbackAttempt[],
    readonly admissionExhaustion?: DeploymentAdmissionExhaustedError,
  ) {
    super(
      "provider_failed",
      `All SERP providers failed: ${attempts.map((attempt) => `${attempt.provider} (${attempt.message})`).join("; ")}`,
    );
    this.name = "ProviderChainError";
    this.dominantCode = dominantErrorCode(
      attempts.map((attempt) => attempt.code ?? "provider_transient"),
    );
  }
}
