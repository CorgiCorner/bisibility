import { ProjectReadOnlyError } from "@/lib/deployment/project-write-mode";
import { OperationAccessDeniedError } from "@/lib/operations/access-error";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import { ProviderCallError } from "@/lib/providers/call-error";
import { DeploymentAdmissionExhaustedError } from "@/lib/providers/execution-extension-errors";
import { ProviderRateLimitedError } from "@/lib/providers/rate-limit-error";
import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import { BudgetExhaustedError } from "@/lib/rank-check/budget";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const paid = vi.hoisted(() => vi.fn());
vi.mock("@/lib/provider-lookups/paid-call", () => ({
  paidProviderCall: paid,
  preflightProviderBudget: vi.fn(),
  requiredEstimatedCostCents: () => 1,
  ProviderLookupSignal: class extends Error {},
}));

import { BacklinksHistoryEvidenceError, fetchBacklinksAnalysis } from "./provider-call";

const input = {
  budgetCapCents: 5000,
  includeSubdomains: false,
  mode: "as_is" as const,
  origin: { source: "app" as const },
  projectId: "project",
  resultLimit: 100,
  scope: "site" as const,
  target: "sub.example.com",
  source: {
    connection: { id: "connection" },
    provider: {
      id: "dataforseo",
      fetchBacklinksSummary: vi.fn(),
      fetchBacklinksHistory: vi.fn(),
      fetchBacklinksRows: vi.fn(),
    },
  } as never,
};
beforeEach(() => paid.mockReset());
afterEach(() => vi.useRealTimers());

it("reserves twelve months and sends the same frozen bounds after a summary crosses midnight", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-30T23:59:59.000Z"));
  const fetchHistory = vi.fn().mockResolvedValue({ costCents: 2, rows: [] });
  const source = {
    connection: { id: "connection" },
    provider: { id: "dataforseo", fetchBacklinksHistory: fetchHistory },
  } as never;
  paid
    .mockImplementationOnce(async () => {
      vi.setSystemTime(new Date("2026-10-01T00:00:01.000Z"));
      return { costCents: 1, summary: {} };
    })
    .mockImplementationOnce(({ call }) => call({ apiKey: "test" }))
    .mockResolvedValueOnce({ costCents: 3, rows: [], totalCount: 0 });
  await fetchBacklinksAnalysis({ ...input, source });
  const historyWindow = { dateFrom: "2025-09-01", dateTo: "2026-08-31" };
  expect(paid.mock.calls[1][0]).toMatchObject({ itemCount: 12, historyWindow });
  expect(fetchHistory).toHaveBeenCalledWith(
    { apiKey: "test" },
    expect.objectContaining({ historyWindow }),
  );
});
it.each([0, 2])("keeps summary and rows after a known-cost history error of %i", async (cost) => {
  paid
    .mockResolvedValueOnce({ costCents: 1, summary: { backlinksTotal: 123 } })
    .mockRejectedValueOnce(new ProviderCallError("History is unsupported for this target", cost))
    .mockResolvedValueOnce({
      costCents: 3,
      rows: [{ sourceDomain: "example.org" }],
      totalCount: 1,
    });
  await expect(fetchBacklinksAnalysis(input)).resolves.toMatchObject({
    summary: { backlinksTotal: 123 },
    rows: [{ sourceDomain: "example.org" }],
    history: [],
    historyUnavailable: true,
    costCents: 4 + cost,
  });
  expect(paid).toHaveBeenCalledTimes(3);
});
it.each([
  new ProviderCallError("auth denied", 0, "provider_auth"),
  new ProviderCallError("billing denied", 0, "provider_billing"),
  new ProviderAuthError("dataforseo"),
  new DeploymentAdmissionExhaustedError("budget"),
  new OperationAccessDeniedError(),
  new ProjectReadOnlyError(),
  new ProviderRateLimitedError("dataforseo"),
  new BudgetExhaustedError({ projectId: "example" } as never),
])("keeps unsafe history failures fatal: %s", async (error) => {
  paid.mockResolvedValueOnce({ costCents: 1, summary: {} }).mockRejectedValueOnce(error);
  await expect(fetchBacklinksAnalysis(input)).rejects.toBe(error);
  expect(paid).toHaveBeenCalledTimes(2);
});

it.each([
  [new ProviderCallError("unknown charge"), "provider_transient", null],
  [
    new ProviderUsagePersistenceError({ phase: "response_body", attemptId: "private" }),
    "provider_usage_unconfirmed",
    "response_body",
  ],
  [
    new ProviderUsagePersistenceError({ phase: "private-phase" as never }),
    "provider_usage_unconfirmed",
    "unknown",
  ],
])(
  "attaches server-only summary evidence while retaining original cause: %s",
  async (error, code, phase) => {
    paid
      .mockResolvedValueOnce({ costCents: 1, summary: { backlinksTotal: 123 } })
      .mockRejectedValueOnce(error);
    const rejection = await fetchBacklinksAnalysis(input).catch((failure: unknown) => failure);
    expect(rejection).toBeInstanceOf(BacklinksHistoryEvidenceError);
    expect(rejection).toMatchObject({
      cause: error,
      knownSummaryCostCents: 1,
      summary: { backlinksTotal: 123 },
      historyFailure: { code, phase },
    });
    expect(paid).toHaveBeenCalledTimes(2);
  },
);

it("shares one atomic cost ceiling across all modules of an analysis", async () => {
  paid
    .mockResolvedValueOnce({ costCents: 1, summary: {} })
    .mockResolvedValueOnce({ costCents: 1, rows: [] })
    .mockResolvedValueOnce({ costCents: 1, rows: [], totalCount: 0 });
  await fetchBacklinksAnalysis({ ...input, maxCostCents: 9 });
  const limits = paid.mock.calls.map(([request]) => request.costLimit);
  expect(limits).toHaveLength(3);
  expect(limits[0]).toBeDefined();
  expect(limits.every((limit) => limit === limits[0])).toBe(true);
  expect(limits[0].remaining()).toBe("9");
});
