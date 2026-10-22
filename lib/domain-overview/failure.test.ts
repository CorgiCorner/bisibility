import { ActionPaymentError } from "@/lib/action-payment/token";
import { OperationAccessDeniedError } from "@/lib/operations/access-error";
import { markProviderFailurePhase } from "@/lib/provider-lookups/failure-phase";
import { ProviderCallError } from "@/lib/providers/call-error";
import { ProviderCostLimitError } from "@/lib/providers/cost-limit";
import { DeploymentAdmissionExhaustedError } from "@/lib/providers/execution-extension-errors";
import { ProviderRateLimitedError } from "@/lib/providers/rate-limit-error";
import {
  ProviderConnectionChangedError,
  ProviderUsagePersistenceError,
} from "@/lib/providers/usage";
import { afterEach, expect, it, vi } from "vitest";
import { durableDomainOverviewModules, storedDomainOverviewModule } from "./cache";
import { domainOverviewFailure } from "./failure";
import { readDomainOverviewFailure, storedDomainOverviewFailure } from "./failure-details";

vi.mock("server-only", () => ({}));
const report = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/observability/server-message", () => ({ reportServerMessage: report }));
afterEach(() => vi.clearAllMocks());

it.each([
  [new ProviderConnectionChangedError(), "provider_connection_changed", "before_dispatch"],
  [new OperationAccessDeniedError(), "operation_access_denied", "before_dispatch"],
  [new DeploymentAdmissionExhaustedError(), "payment_admission", "before_dispatch"],
  [new ActionPaymentError("payment_quote_changed"), "payment_quote_changed", "before_dispatch"],
  [new ProviderCostLimitError(10, 1), "cost_limit_exceeded", "before_dispatch"],
  [new ProviderRateLimitedError("dataforseo"), "rate_limited", "before_dispatch"],
  [new ProviderRateLimitedError("dataforseo", { source: "provider" }), "rate_limited", "provider"],
  [
    new ProviderUsagePersistenceError({ phase: "admission" }),
    "usage_persistence",
    "before_dispatch",
  ],
  [new ProviderUsagePersistenceError({ phase: "settlement" }), "usage_persistence", "persistence"],
])("classifies %s as %s in %s", (error, reason, phase) => {
  expect(domainOverviewFailure(error, undefined, true)).toMatchObject({ ok: false, reason, phase });
});

it("retains charged cost and an allowlisted provider code", () => {
  expect(
    domainOverviewFailure(new ProviderCallError("private response", 7, "provider_billing")),
  ).toEqual({
    ok: false,
    costCents: 7,
    reason: "provider_error",
    phase: "provider",
    providerCode: "provider_billing",
  });
});

it("reports unexpected failures using safe constants only, even if the reporter fails", () => {
  report.mockRejectedValueOnce(new Error("reporter down"));
  const error = new TypeError("password=secret account=private request body");
  expect(domainOverviewFailure(error)).toEqual({
    ok: false,
    costCents: 0,
    reason: "unexpected",
    phase: "provider",
  });
  expect(report).toHaveBeenCalledWith("domain-overview-module-failure", {
    level: "error",
    extra: { phase: "provider", error_type: "TypeError" },
  });
  expect(JSON.stringify(report.mock.calls)).not.toMatch(/secret|private|request body/);
});

it("round trips only safe failure metadata, keeps legacy nulls and never recharges cached failures", () => {
  const stored = storedDomainOverviewFailure({
    reason: "provider_error",
    phase: "provider",
    providerCode: "provider_auth",
  });
  expect(readDomainOverviewFailure({ ...stored, secret: "hidden" })).toEqual(stored);
  expect(storedDomainOverviewModule(stored, "2026-10-22T12:00:00Z")).toEqual({
    ...stored,
    costCents: 0,
    ok: false,
  });
  expect(storedDomainOverviewModule(null, "2026-10-22T12:00:00Z")).toEqual({
    reason: "lookup_failed",
    costCents: 0,
    ok: false,
  });
  expect(readDomainOverviewFailure({ reason: "private", phase: "provider" })).toBeNull();
});

it("hydrates a failed snapshot module from a newer successful page cache only", () => {
  const failure = { reason: "unexpected", phase: "provider" } as const;
  const data = { rows: [], totalCount: 0, costCents: 4, consumedCount: 0 };
  const result = durableDomainOverviewModules({
    fetchedAt: "2026-10-22T12:00:00Z",
    keywords: failure,
    pages: failure,
    pagesCached: null,
    keywordsCached: { costCents: 4, data, fetchedAt: "2026-10-22T12:01:00Z" },
  });
  expect(result.hydrate).toBe(true);
  expect(result.keywords).toMatchObject({ ok: true, cached: true, costCents: 0, data });
  expect(result.pages).toMatchObject({ ok: false, ...failure });
});

it("retains the source phase for an unknown pre-dispatch error without changing its identity", () => {
  const error = new RangeError("private invalid estimate");
  expect(markProviderFailurePhase(error, "before_dispatch")).toBe(error);
  expect(domainOverviewFailure(error)).toMatchObject({
    reason: "unexpected",
    phase: "before_dispatch",
  });
  expect(report).toHaveBeenCalledWith("domain-overview-module-failure", {
    level: "error",
    extra: { phase: "before_dispatch", error_type: "RangeError" },
  });
});
