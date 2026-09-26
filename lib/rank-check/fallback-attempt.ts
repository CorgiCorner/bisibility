import { ProviderAllocationExhaustedError } from "@/lib/provider-usage/enforcement";
import { surfaceOf } from "@/lib/provider-usage/surface";
import type { ProviderRequestSource } from "@/lib/provider-usage/tag";
import { providerErrorCodeFromError } from "@/lib/providers/call-error";
import { DeploymentAdmissionExhaustedError } from "@/lib/providers/execution-extension-errors";
import type { FallbackAttempt } from "./provider-chain-error";
import { RankCheckRunnerError, type RankCheckRunnerErrorCode } from "./runner-error";

const FALLBACK_CODES: ReadonlySet<RankCheckRunnerErrorCode> = new Set([
  "provider_failed",
  "provider_rate_limited",
  "credentials_unavailable",
]);

export function fallbackAttempt(
  error: unknown,
  provider: string,
  source?: ProviderRequestSource,
): {
  attempt: FallbackAttempt;
  rateLimited: boolean;
  admission?: DeploymentAdmissionExhaustedError;
} | null {
  if (
    error instanceof ProviderAllocationExhaustedError ||
    error instanceof DeploymentAdmissionExhaustedError
  ) {
    return {
      admission:
        error instanceof DeploymentAdmissionExhaustedError
          ? error
          : new DeploymentAdmissionExhaustedError("budget", {
              scope: "connection",
              surface: error.surface,
            }),
      attempt: {
        message: error.message,
        provider,
        reason: "allocation_exhausted",
        surface:
          error instanceof ProviderAllocationExhaustedError
            ? error.surface
            : (error.surface ?? surfaceOf(source)),
      },
      rateLimited: false,
    };
  }
  if (error instanceof RankCheckRunnerError && FALLBACK_CODES.has(error.code)) {
    return {
      attempt: {
        message: error.message,
        provider,
        code:
          error.code === "provider_rate_limited"
            ? "provider_rate_limited"
            : providerErrorCodeFromError(error.cause),
      },
      rateLimited: error.code === "provider_rate_limited",
    };
  }
  return null;
}
