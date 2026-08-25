import { ProviderAuthError } from "@/lib/providers/auth-error";
import type { ProviderErrorCode } from "./provider-error-code";

export class ProviderCallError extends Error {
  code: ProviderErrorCode;

  constructor(
    message: string,
    readonly costCents: number | null = null,
    code?: ProviderErrorCode,
  ) {
    super(message);
    this.name = "ProviderCallError";
    this.code = code ?? "provider_transient";
  }
}

export function chargedProviderCostCents(error: unknown): number | null {
  if (!(error instanceof ProviderCallError)) return null;
  return error.costCents != null && Number.isFinite(error.costCents) && error.costCents > 0
    ? error.costCents
    : null;
}

export function providerErrorCodeFromError(error: unknown): ProviderErrorCode {
  if (error instanceof ProviderCallError) return error.code;
  if (error instanceof ProviderAuthError) return "provider_auth";
  return "provider_transient";
}
