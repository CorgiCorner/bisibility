/** Prevent credentials in query strings or structured request bodies reaching telemetry. */
export function redactRequestSecrets<T>(value: T, depth = 0): T {
  if (depth > 20) return "[redacted]" as T;
  if (typeof value === "string")
    return value.replace(
      /((?:^|[?&])(?:api_key|access_token|token|password)=)[^&#\s]*/gi,
      "$1[redacted]",
    ) as T;
  if (Array.isArray(value)) return value.map((v) => redactRequestSecrets(v, depth + 1)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /^(authorization|cookie|password|apiKey|api_key|x-api-key|secret|access_token)$/i.test(key)
          ? "[redacted]"
          : redactRequestSecrets(item, depth + 1),
      ]),
    ) as T;
  }
  return value;
}
export function secretBearingRequest(url: string) {
  try {
    const parsed = new URL(url);
    return ["api_key", "access_token", "password"].some((key) => parsed.searchParams.has(key));
  } catch {
    return false;
  }
}
