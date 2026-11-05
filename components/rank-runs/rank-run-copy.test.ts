import messages from "@/messages/core/en/project-runs-rank-runs.json";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { localizedBlockedRunCopy } from "./rank-run-copy";

const t = createTranslator({ locale: "en", messages, namespace: "projectRuns.rankRuns" });
describe("blocked run guidance", () => {
  it.each(["budget_exhausted", "usage_reconciliation_required"])(
    "does not promise a reset or invent zero amounts for %s",
    (reason) => {
      const copy = localizedBlockedRunCopy(
        { reason, deploymentMode: "cloud", budget: null },
        t,
        "en",
      );
      expect(copy.action).toBe("review_usage");
      expect(copy.description).not.toContain("$0.00");
      expect(copy.description).not.toContain("checks resume");
    },
  );
  it("retains a confirmed cap without promising automatic recovery", () => {
    const copy = localizedBlockedRunCopy(
      {
        reason: "budget_exhausted",
        deploymentMode: "cloud",
        budget: { spentCents: 5100, capCents: 5000 },
      },
      t,
      "en",
    );
    expect(copy.description).toContain("Provider cost reported this month (UTC): $51.00");
    expect(copy.description).toContain("Monthly project budget limit: $50.00");
    expect(copy.action).toBe("review_usage");
    expect(copy.description).not.toContain("resets");
  });
});

it("never infers reached admission from provider cost below the configured cap", () => {
  const copy = localizedBlockedRunCopy(
    {
      reason: "budget_exhausted",
      deploymentMode: "cloud",
      budget: { spentCents: 1000, capCents: 5000 },
    },
    t,
    "en",
  );
  expect(copy.action).toBe("review_usage");
  expect(copy.title).toBe("Review budget and usage");
  expect(copy.description).not.toContain("of $50.00");
});

it("names the disabled queued route instead of a generic wait", () => {
  const copy = localizedBlockedRunCopy(
    { reason: "queued_dataforseo_disabled", deploymentMode: "self-host", budget: null },
    t,
    "en",
  );
  expect(copy.title).toBe("Scheduled checks off");
  expect(copy.description).toBe("Scheduled DataForSEO checks are turned off on this installation.");
  expect(copy.action).toBeNull();
});

it.each([
  ["operation_unavailable", "Blocked: plan required"],
  ["provider_account_blocked", "Blocked: verify provider"],
])("labels %s", (reason, label) => {
  expect(localizedBlockedRunCopy({ reason, deploymentMode: "cloud" }, t, "en").compact).toBe(label);
});

it("keeps other safe blocker codes visible without displaying arbitrary text", () => {
  expect(
    localizedBlockedRunCopy({ reason: "pricing_unavailable", deploymentMode: "cloud" }, t, "en")
      .compact,
  ).toBe("Blocked: pricing_unavailable");
  expect(
    localizedBlockedRunCopy({ reason: "private arbitrary text", deploymentMode: "cloud" }, t, "en")
      .compact,
  ).not.toContain("private arbitrary text");
});
