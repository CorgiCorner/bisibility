import type { CheckRunRow } from "@/lib/checks/contract";
import { describe, expect, it } from "vitest";
import {
  formatResult,
  INTERNAL_ERROR_LABEL,
  isInternalErrorString,
  presentCheckError,
} from "./check-runs-format";

const now = new Date("2026-07-24T14:45:00.000Z");

const prismaError =
  "Invalid `prisma.providerConnection.findMany()` invocation: The column " +
  "`provider_connections.credentialsHash` does not exist in the current database.";

function failedRun(error: string | null): CheckRunRow {
  return {
    attemptCount: 1,
    attempts: [],
    checkedAt: now.toISOString(),
    costCents: null,
    degradedToCountry: false,
    durationMs: null,
    error,
    estimatedCostCents: null,
    finishedAt: null,
    id: "run",
    keyword: "kw",
    keywordId: "kw",
    keywordPublicId: "kw",
    position: null,
    previousPosition: null,
    provider: "dataforseo",
    providerLabel: "DataForSEO",
    requestedDepth: 20,
    startedAt: null,
    status: "failed",
    trigger: "scheduled",
    viaFallback: false,
  };
}

describe("isInternalErrorString", () => {
  it("flags Prisma invocation dumps", () => {
    expect(isInternalErrorString(prismaError)).toBe(true);
  });

  it("flags backticks, newlines, stack traces, and error class names", () => {
    expect(isInternalErrorString("value `x` bad")).toBe(true);
    expect(isInternalErrorString("line one\nline two")).toBe(true);
    expect(isInternalErrorString("boom at handler (/app/x.ts:1:2)")).toBe(true);
    expect(isInternalErrorString("TypeError: undefined is not a function")).toBe(true);
  });

  it("flags over-long strings", () => {
    expect(isInternalErrorString("x".repeat(121))).toBe(true);
  });

  it("passes concise human messages through", () => {
    expect(isInternalErrorString("All providers failed")).toBe(false);
    expect(isInternalErrorString("Check timed out")).toBe(false);
    expect(isInternalErrorString("Provider quota exceeded")).toBe(false);
  });
});

describe("presentCheckError", () => {
  it("maps internal shapes to a neutral label", () => {
    expect(presentCheckError(prismaError)).toBe(INTERNAL_ERROR_LABEL);
  });

  it("keeps concise messages verbatim (trimmed)", () => {
    expect(presentCheckError("  All providers failed  ")).toBe("All providers failed");
  });
});

describe("formatResult", () => {
  it("never surfaces raw internal errors in the Result cell", () => {
    expect(formatResult(failedRun(prismaError), now)).toBe(INTERNAL_ERROR_LABEL);
  });

  it("keeps the timeout copy and concise errors", () => {
    expect(formatResult(failedRun("stale running check"), now)).toBe("Timed out after 15 min");
    expect(formatResult(failedRun("All providers failed"), now)).toBe("All providers failed");
    expect(formatResult(failedRun(null), now)).toBe("All providers failed");
  });
});
