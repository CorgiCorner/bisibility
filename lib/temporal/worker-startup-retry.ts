export type WorkerStartupStage =
  | "app-database-migrations"
  | "namespace-cache"
  | "persistence-schema"
  | "schedule-bootstrap"
  | "search-attributes-bootstrap"
  | "tls-auth"
  | "transport";

type RetryClass = "permanent" | "transient";

const PERMANENT_CODES = new Set([
  "CERT_HAS_EXPIRED",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "FAILED_PRECONDITION",
  "INVALID_ARGUMENT",
  "PERMISSION_DENIED",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNAUTHENTICATED",
  3,
  7,
  9,
  16,
]);
const NAMESPACE_PENDING_CODES = new Set(["NOT_FOUND", 5]);

function errorCode(error: unknown, seen: Set<object> = new Set()): string | number | undefined {
  if (!error || typeof error !== "object") return undefined;
  if (seen.has(error)) return undefined;
  seen.add(error);
  const candidate = error as { cause?: unknown; code?: unknown; status?: unknown };
  if (typeof candidate.code === "string" || typeof candidate.code === "number") {
    return candidate.code;
  }
  if (typeof candidate.status === "string" || typeof candidate.status === "number") {
    return candidate.status;
  }
  return errorCode(candidate.cause, seen);
}

export function classifyWorkerStartupError(stage: WorkerStartupStage, error: unknown): RetryClass {
  const code = errorCode(error);
  if (PERMANENT_CODES.has(code as never)) return "permanent";
  if (stage === "namespace-cache" && NAMESPACE_PENDING_CODES.has(code as never)) {
    return "transient";
  }
  // Unknown SDK and platform codes are retried inside the bounded stage budget.
  // Only stable codes known to be permanent may require an external restart.
  return "transient";
}

type RetryOptions = {
  maxElapsedMs?: number;
  now?: () => number;
  random?: () => number;
  sleep?: (delayMs: number) => Promise<void>;
};

const defaultSleep = (delayMs: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });

export async function runWorkerStartupStage<T>(
  stage: WorkerStartupStage,
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxElapsedMs = options.maxElapsedMs ?? 30_000;
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? defaultSleep;
  const startedAt = now();
  let attempt = 0;

  while (true) {
    attempt += 1;
    try {
      console.error("[temporal] worker startup attempt", { attempt, stage });
      return await operation();
    } catch (error) {
      const retryClass = classifyWorkerStartupError(stage, error);
      const elapsedMs = now() - startedAt;
      const boundedStageAttemptsExhausted =
        (stage === "namespace-cache" || stage === "tls-auth") && attempt >= 3;
      if (
        retryClass === "permanent" ||
        boundedStageAttemptsExhausted ||
        elapsedMs >= maxElapsedMs
      ) {
        console.error("[temporal] worker startup stage failed", {
          attempt,
          code: errorCode(error) ?? "unknown",
          retryClass,
          stage,
        });
        throw error;
      }

      const baseDelayMs = stage === "namespace-cache" ? 2_000 : 250;
      const exponentialMs = Math.min(5_000, baseDelayMs * 2 ** (attempt - 1));
      const delayMs = Math.min(maxElapsedMs - elapsedMs, exponentialMs + random() * 250);
      console.error("[temporal] worker startup retry", {
        attempt,
        code: errorCode(error) ?? "unknown",
        delayMs: Math.round(delayMs),
        stage,
      });
      await sleep(delayMs);
    }
  }
}
