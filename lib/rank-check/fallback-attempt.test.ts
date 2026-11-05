import { BudgetExhaustedError } from "@/lib/metering/admission-errors";
import { ProviderAllocationExhaustedError } from "@/lib/provider-usage/enforcement";
import { DeploymentAdmissionExhaustedError } from "@/lib/providers/execution-extension-errors";
import { UnresolvedRedirectError } from "@/lib/providers/serp/unresolved-redirect-error";
import { ProviderRecoveryAdmissionError } from "@/lib/providers/usage";
import { describe, expect, it } from "vitest";
import { fallbackAttempt } from "./fallback-attempt";
import { RankCheckRunnerError } from "./runner-error";

const budget = { projectId: "project_1", capCents: 100, spentCents: 100 };

describe("fallbackAttempt", () => {
  it.each(["byok", "platform"] as const)(
    "moves on when the %s funding source reached its project limit",
    (fundingSource) => {
      const error = new BudgetExhaustedError({ ...budget, fundingSource });
      expect(fallbackAttempt(error, "dataforseo")).toEqual({
        attempt: { message: error.message, provider: "dataforseo", reason: "funding_exhausted" },
        funding: error,
        rateLimited: false,
      });
    },
  );

  it.each([
    ["the shared project cap", {}],
    ["unresolved usage", { fundingSource: "byok", reason: "usage_reconciliation_required" }],
    ["incomplete valuation", { fundingSource: "platform", valuationIncomplete: true }],
    ["a missing budget", { fundingSource: "byok", reason: "budget_missing" }],
  ] as const)("stops the chain for %s", (_label, extra) => {
    expect(fallbackAttempt(new BudgetExhaustedError({ ...budget, ...extra }), "serpapi")).toBe(
      null,
    );
  });

  it("refuses a second purchase after a charged response failed", () => {
    const error = new RankCheckRunnerError("provider_failed", "Partial SERP result.", {
      chargedCents: 0.3,
    });
    expect(fallbackAttempt(error, "dataforseo")).toBeNull();
  });

  it.each([0, null])("still falls back when the failed response cost %s", (chargedCents) => {
    const error = new RankCheckRunnerError("provider_failed", "Task error.", { chargedCents });
    expect(fallbackAttempt(error, "dataforseo")?.attempt).toMatchObject({
      provider: "dataforseo",
      message: "Task error.",
    });
  });
});

it.each([
  new ProviderAllocationExhaustedError("connection", "app", null, "usage_reconciliation_required"),
  new ProviderAllocationExhaustedError("connection", "app", null, "budget_missing"),
  new DeploymentAdmissionExhaustedError("budget", {
    budgetReason: "usage_reconciliation_required",
  }),
  new DeploymentAdmissionExhaustedError("budget", { budgetReason: "budget_missing" }),
])("never skips an uncertain or missing connection/deployment budget (%s)", (error) => {
  expect(fallbackAttempt(error, "dataforseo")).toBeNull();
});
it("retains positive measured charges through a runner error wrapper", () => {
  const cause = new RankCheckRunnerError("provider_failed", "Charged failure", {
    chargedCents: 0.3,
  });
  const wrapped = new RankCheckRunnerError("provider_failed", "Wrapped", {
    cause,
    chargedCents: 0,
  });
  expect(wrapped.chargedCents).toBe(0.3);
  expect(fallbackAttempt(wrapped, "dataforseo")).toBeNull();
});

it.each(["account_blocked", "accounting_review"] as const)(
  "allows fallback for a pre-send %s refusal",
  (reason) => {
    const error = new ProviderRecoveryAdmissionError(reason, { kind: "account" });
    expect(fallbackAttempt(error, "dataforseo")).toMatchObject({
      attempt: { provider: "dataforseo", reason: "account_blocked", recoveryReason: reason },
      rateLimited: false,
    });
  },
);

it.each([0, null])("never falls back after an unresolved result with cost %s", (chargedCents) => {
  const cause = new UnresolvedRedirectError(chargedCents);
  const error = new RankCheckRunnerError("provider_failed", cause.message, { cause, chargedCents });
  expect(fallbackAttempt(error, "dataforseo")).toBeNull();
});

it.each([0, null, 1])(
  "does not buy fallback for incomplete coverage even with cost %s",
  async (chargedCents) => {
    const { OrganicCoverageError } = await import("@/lib/providers/serp/organic-coverage-error");
    const error = new RankCheckRunnerError("provider_failed", "Incomplete coverage", {
      cause: new OrganicCoverageError("19/20"),
      chargedCents,
    });
    expect(fallbackAttempt(error, "serpapi")).toBeNull();
  },
);

it("does not recognize a nearby message as a typed coverage failure", () => {
  const error = new RankCheckRunnerError("provider_failed", "organic_depth_not_covered_note", {
    cause: new Error("organic_depth_not_covered_note"),
    chargedCents: 0,
  });
  expect(fallbackAttempt(error, "serpapi")).not.toBeNull();
});
