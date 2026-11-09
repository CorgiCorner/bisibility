import { describe, expect, it } from "vitest";
import { resolveSiteAuditBudget } from "./budget-extension";

describe("default site audit budget", () => {
  it.each([
    [1, 1],
    [10, 10],
    [15, 15],
    [120, 15],
  ])("caps a request for %i pages at %i", async (requestedPages, maxPages) => {
    await expect(
      resolveSiteAuditBudget({
        projectId: "project",
        target: "https://example.com/",
        requestedPages,
      }),
    ).resolves.toEqual({ maxPages, priority: 0, stopReason: "page_budget" });
  });
});
