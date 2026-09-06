import { describe, expect, it } from "vitest";
import { blockedRunPresentation } from "./blocked-presentation";

describe("blockedRunPresentation", () => {
  it("maps every persisted blocked reason without exposing its raw code", () => {
    const reasons = [
      "temporal_unavailable",
      "budget_exhausted",
      "no_provider",
      "credentials_unavailable",
      "provider_unavailable",
      "market_inactive",
      "keyword_archived",
    ];

    for (const reason of reasons) {
      const presentation = blockedRunPresentation({ deploymentMode: "cloud", reason });
      expect(
        `${presentation.title} ${presentation.description} ${presentation.compact}`,
      ).not.toContain(reason);
    }
  });

  it("gives self-host operators the worker-status action", () => {
    expect(
      blockedRunPresentation({ deploymentMode: "self-host", reason: "temporal_unavailable" }),
    ).toEqual({
      action: "worker_status",
      compact: "Waiting for the background worker",
      description: "The background worker isn't running. Restart it and the run starts on its own.",
      title: "Waiting for the background worker",
    });
  });

  it("keeps hosted worker recovery automatic", () => {
    expect(
      blockedRunPresentation({ deploymentMode: "cloud", reason: "temporal_unavailable" }),
    ).toMatchObject({
      action: null,
      description:
        "The background worker isn't reachable right now. The run starts on its own once it reconnects.",
    });
  });

  it("names a market that stopped being runnable instead of falling back to the generic wait", () => {
    const generic = blockedRunPresentation({ deploymentMode: "cloud", reason: null });

    for (const reason of ["market_inactive", "keyword_archived"]) {
      const presentation = blockedRunPresentation({ deploymentMode: "cloud", reason });
      expect(presentation.title).not.toBe(generic.title);
      expect(presentation.compact).not.toBe("Waiting to start");
      expect(presentation.description).not.toBe(generic.description);
    }
    expect(blockedRunPresentation({ deploymentMode: "cloud", reason: "market_inactive" })).toEqual({
      action: null,
      compact: "Market not active",
      description:
        "This keyword's market is paused, so the check was stopped before it cost anything.",
      title: "Market not active",
    });
    expect(
      blockedRunPresentation({ deploymentMode: "self-host", reason: "keyword_archived" }).title,
    ).toBe("Keyword archived");
  });

  it("uses the live monthly budget when it is available", () => {
    expect(
      blockedRunPresentation({
        budget: { capCents: 1_000, spentCents: 800 },
        deploymentMode: "cloud",
        reason: "budget_exhausted",
      }).description,
    ).toBe("Spent $8.00 of $10.00 this month; checks resume when the budget resets.");
  });
});
