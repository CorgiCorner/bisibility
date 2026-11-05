import { describe, expect, it } from "vitest";
import { isRankCheckFailureCode, providerFailurePresentation } from "./failure-presentation";

describe("providerFailurePresentation", () => {
  it.each([
    ["provider_account_restricted", "restricted access", false, true],
    ["provider_billing", "insufficient funds", true, true],
    ["provider_auth", "credentials were rejected", false, true],
    ["provider_rate_limited", "temporarily rate limited", true, false],
    ["provider_transient", "temporarily unavailable", true, false],
    ["provider_unresolved_redirects", "no position", false, false],
    ["provider_result_unusable", "could not be processed safely", true, false],
    ["organic_result_unclassifiable", "could not classify", false, false],
    ["organic_depth_not_covered", "requested depth", false, false],
    [null, "because of a provider error", true, false],
    ["provider_unknown", "because of a provider error", true, false],
  ] as const)("maps %s to safe presentation", (code, copy, retry, integrations) => {
    const presentation = providerFailurePresentation(code);
    expect(presentation.message).toContain(copy);
    expect(presentation.showRetry).toBe(retry);
    expect(presentation.showOpenIntegrations).toBe(integrations);
  });
});

it("corrects legacy billing labels for recorded account restrictions", () => {
  expect(
    providerFailurePresentation(
      "provider_billing",
      "We noticed some unusual activity in your DataForSEO account, so we’ve temporarily paused access as a precaution.",
    ),
  ).toMatchObject({ code: "provider_account_restricted", showRetry: false });
});

it("does not treat a nearby identifier as an unclassifiable organic result", () => {
  expect(providerFailurePresentation(null, "organic_result_unclassifiable_note").code).toBeNull();
  expect(
    providerFailurePresentation(null, "the organic result was unclassifiable").code,
  ).toBeNull();
  expect(
    providerFailurePresentation("provider_billing", "organic_result_unclassifiable").code,
  ).toBe("provider_billing");
});

it("recognizes the unclassifiable anomaly code without depending on the surrounding sentence", () => {
  const fromCode = providerFailurePresentation("organic_result_unclassifiable");
  const fromToken = providerFailurePresentation(
    null,
    "example organic payload is indeterminate: organic_result_unclassifiable",
  );
  for (const presentation of [fromCode, fromToken]) {
    expect(presentation).toMatchObject({
      code: "organic_result_unclassifiable",
      showOpenIntegrations: false,
      showRetry: false,
    });
    expect(presentation.message).toBe(
      "The provider returned a search result we could not classify, so this check has no position.",
    );
    expect(presentation.message).not.toMatch(/retry|charge/i);
  }
});

it("describes unresolved redirects without promising a retry or a charge", () => {
  const presentation = providerFailurePresentation("provider_unresolved_redirects");
  expect(presentation.message).toBe(
    "The provider returned links we could not resolve, so this check has no position.",
  );
  expect(presentation.message).not.toMatch(/retry|charge/i);
  expect(presentation.showRetry).toBe(false);
});

it("keeps own-account funding advice separate from instance capacity failures", () => {
  expect(providerFailurePresentation("provider_billing").message).toContain("Add funds");
  const capacity = providerFailurePresentation("provider_capacity_unavailable");
  expect(capacity.message).toContain("You were not charged");
  expect(capacity.message).not.toContain("Add funds");
  expect(capacity.showOpenIntegrations).toBe(true);
});

it("accepts every stored rank-check failure code and nothing else", () => {
  for (const code of [
    "provider_transient",
    "provider_unresolved_redirects",
    "provider_result_unusable",
    "organic_depth_not_covered",
  ])
    expect(isRankCheckFailureCode(code)).toBe(true);
  for (const code of [null, "", "no_match", "provider_unknown"])
    expect(isRankCheckFailureCode(code)).toBe(false);
});

it("recognizes a legacy depth-coverage token without treating nearby tokens as coverage failures", () => {
  expect(
    providerFailurePresentation(
      "provider_transient",
      "indeterminate: organic_depth_not_covered (19/20)",
    ),
  ).toMatchObject({ code: "organic_depth_not_covered", showRetry: false });
  expect(
    providerFailurePresentation("provider_transient", "organic_depth_not_covered_note"),
  ).toMatchObject({ code: "provider_transient", showRetry: true });
  expect(providerFailurePresentation("provider_billing", "organic_depth_not_covered").code).toBe(
    "provider_billing",
  );
});
