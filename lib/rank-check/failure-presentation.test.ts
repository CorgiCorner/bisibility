import { describe, expect, it } from "vitest";
import { providerFailurePresentation } from "./failure-presentation";

describe("providerFailurePresentation", () => {
  it.each([
    ["provider_account_restricted", "restricted access", false, true],
    ["provider_billing", "insufficient funds", true, true],
    ["provider_auth", "credentials were rejected", false, true],
    ["provider_rate_limited", "temporarily rate limited", true, false],
    ["provider_transient", "temporarily unavailable", true, false],
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
