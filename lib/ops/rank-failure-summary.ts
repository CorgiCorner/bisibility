import type { Prisma } from "@/lib/generated/prisma/client";

/** Map free-form provider errors to a small diagnostic vocabulary safe for cross-tenant views. */
export function summarizeRankFailure(error: string | null): string {
  const normalized = error?.toLowerCase() ?? "";
  if (normalized.includes("rate limit") || normalized.includes("429")) {
    return "Provider rate limited";
  }
  if (
    normalized.includes("unauthorized") ||
    normalized.includes("authentication") ||
    normalized.includes("credential") ||
    normalized.includes("401") ||
    normalized.includes("403")
  ) {
    return "Provider authentication failed";
  }
  if (normalized.includes("timeout") || normalized.includes("timed out")) {
    return "Provider request timed out";
  }
  if (normalized.includes("budget")) return "Budget limit reached";
  return "Provider check failed";
}

/** Minimal rank-check shape both failure and fallback breakdowns read from. */
export type RankFailureSource = {
  attempts: Prisma.JsonValue | null;
  checkedAt: Date;
  error: string | null;
  keyword: { projectId: string };
  provider: string;
};

/** Cross-tenant-safe breakdown row: provider id, summarized reason, project id, timestamp. */
export type RankFailureEntry = {
  errorSummary: string;
  occurredAt: string;
  projectId: string;
  provider: string;
};

/**
 * Preserve per-provider reasons when attempts exist; otherwise emit the aggregate failure.
 */
export function failureEntries(rows: readonly RankFailureSource[]): RankFailureEntry[] {
  return rows.flatMap((row) => {
    const attempts = parseFallbackAttempts(row.attempts);
    if (attempts.length > 0) {
      return attempts.map((attempt) => ({
        errorSummary: summarizeRankFailure(attempt.message),
        occurredAt: row.checkedAt.toISOString(),
        projectId: row.keyword.projectId,
        provider: attempt.provider,
      }));
    }
    return [
      {
        errorSummary: summarizeRankFailure(row.error),
        occurredAt: row.checkedAt.toISOString(),
        projectId: row.keyword.projectId,
        provider: row.provider,
      },
    ];
  });
}

/** Fallback evidence on completed checks: one entry per provider that failed before the winner. */
export function fallbackEntries(rows: readonly RankFailureSource[]): RankFailureEntry[] {
  return rows.flatMap((row) =>
    parseFallbackAttempts(row.attempts).map((attempt) => ({
      errorSummary: summarizeRankFailure(attempt.message),
      occurredAt: row.checkedAt.toISOString(),
      projectId: row.keyword.projectId,
      provider: attempt.provider,
    })),
  );
}

/** Fallback attempt entries recorded on a completed check: the providers that failed before the winner. */
export function parseFallbackAttempts(
  attempts: Prisma.JsonValue | null | undefined,
): { message: string; provider: string }[] {
  if (!Array.isArray(attempts)) return [];
  return attempts.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    return typeof record.provider === "string" && typeof record.message === "string"
      ? [{ message: record.message, provider: record.provider }]
      : [];
  });
}
