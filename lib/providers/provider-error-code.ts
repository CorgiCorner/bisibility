export const PROVIDER_ERROR_CODES = [
  "provider_billing",
  "provider_auth",
  "provider_rate_limited",
  "provider_transient",
] as const;

export type ProviderErrorCode = (typeof PROVIDER_ERROR_CODES)[number];

const CODE_PRIORITY: Record<ProviderErrorCode, number> = {
  provider_billing: 0,
  provider_auth: 1,
  provider_rate_limited: 2,
  provider_transient: 3,
};

export function isProviderErrorCode(value: unknown): value is ProviderErrorCode {
  return typeof value === "string" && (PROVIDER_ERROR_CODES as readonly string[]).includes(value);
}

export function dominantErrorCode(codes: Iterable<ProviderErrorCode>): ProviderErrorCode {
  let result: ProviderErrorCode | null = null;
  for (const code of codes) {
    if (!isProviderErrorCode(code)) continue;
    if (result === null || CODE_PRIORITY[code] < CODE_PRIORITY[result]) {
      result = code;
    }
  }
  return result ?? "provider_transient";
}
