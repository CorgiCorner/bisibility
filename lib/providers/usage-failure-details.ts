import type { ProviderUsagePersistenceError } from "./usage";

const SAFE_NAMES = [
  "AbortError",
  "TimeoutError",
  "TypeError",
  "SyntaxError",
  "RangeError",
  "PrismaClientKnownRequestError",
  "PrismaClientUnknownRequestError",
  "ProviderUsagePersistenceError",
] as const;
const SAFE_CODES = [
  "P1000",
  "P1001",
  "P1002",
  "P1008",
  "P1017",
  "P2002",
  "P2003",
  "P2021",
  "P2022",
  "P2024",
  "P2025",
  "P2028",
  "P2034",
  "P2037",
  "08001",
  "08006",
  "40001",
  "40P01",
  "53300",
  "57P01",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
] as const;
const SAFE_FILES = [
  "lib/providers/usage.ts",
  "lib/providers/serp/serpapi-request.ts",
  "lib/providers/serp/usage-receipts.ts",
  "lib/provider-usage/request-journal.ts",
  "lib/provider-usage/recorder.ts",
  "lib/db/prisma.ts",
];

const nativeStackGetter = Object.getOwnPropertyDescriptor(new Error(), "stack")?.get;
const nativeExceptionName = Object.getOwnPropertyDescriptor(DOMException.prototype, "name")?.get;

function ownValue(value: object, key: string): unknown {
  try {
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (key === "stack" && property?.get && property.get === nativeStackGetter)
      return nativeStackGetter?.call(value);
    return property?.value;
  } catch {
    return undefined;
  }
}

function safeName(value: object) {
  const own = ownValue(value, "name");
  if (own !== undefined) return SAFE_NAMES.find((name) => name === own) ?? "unknown";
  if (value instanceof TypeError) return "TypeError";
  if (value instanceof SyntaxError) return "SyntaxError";
  if (value instanceof RangeError) return "RangeError";
  if (value instanceof DOMException) {
    const name = nativeExceptionName?.call(value);
    return SAFE_NAMES.find((allowed) => allowed === name) ?? "unknown";
  }
  return "unknown";
}

function safeLocations(value: unknown) {
  if (typeof value !== "string") return [];
  return value
    .split("\n")
    .slice(1, 16)
    .flatMap((line) => {
      const file = SAFE_FILES.find((path) => line.includes(`${path}:`));
      if (!file) return [];
      const suffix = line.slice(line.indexOf(`${file}:`) + file.length);
      const position = /^:\d{1,6}:\d{1,6}(?:\)|\s|$)/.exec(suffix)?.[0].trim().replace(/\)$/, "");
      return position ? [`${file}${position}`] : [];
    })
    .slice(0, 4);
}

/** Only closed-set classifications and known source locations cross the activity boundary. */
export function providerUsageFailureDetails(error: ProviderUsagePersistenceError) {
  const causes: Array<{ name: string; code: string; locations: string[] }> = [];
  const seen = new Set<object>();
  const pending: unknown[] = [error];
  for (let index = 0; index < pending.length && index < 8; index += 1) {
    const value = pending[index];
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    causes.push({
      name: safeName(value),
      code:
        SAFE_CODES.find(
          (code) => code === ownValue(value, "code") || code === ownValue(value, "originalCode"),
        ) ?? "unknown",
      locations: safeLocations(ownValue(value, "stack")),
    });
    for (const key of ["cause", "meta", "driverAdapterError"]) pending.push(ownValue(value, key));
  }
  const operationId =
    error.attemptId &&
    /^(?:[a-z0-9]{20,32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/.test(error.attemptId)
      ? error.attemptId
      : undefined;
  return { phase: error.phase, ...(operationId ? { operationId } : {}), causes };
}

export function safeProviderUsageCause(error: ProviderUsagePersistenceError) {
  const details = providerUsageFailureDetails(error);
  const cause = new Error(`Provider usage failure during ${details.phase}.`);
  cause.name = "ProviderUsageFailureCause";
  cause.stack = [
    `${cause.name}: ${cause.message}`,
    ...details.causes.flatMap((item) => [
      `  ${item.name} (${item.code})`,
      ...item.locations.map((location) => `    at ${location}`),
    ]),
  ].join("\n");
  return cause;
}
