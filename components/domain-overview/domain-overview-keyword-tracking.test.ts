import type { SaveSelectedKeywordsAction } from "@/lib/actions/domain-overview";
import { describe, expect, it, vi } from "vitest";
import { saveDomainKeywords } from "./domain-overview-keyword-tracking";
import { domainOverviewReportFixture, domainOverviewScopeFixture } from "./fixtures";

describe("Domain Overview keyword tracking", () => {
  it("maps selected provider rows into the saved-keyword action contract", async () => {
    const keywords = domainOverviewReportFixture.keywords;
    if (!keywords.ok) throw new Error("Keyword fixture must be available");
    const action = vi.fn().mockResolvedValue({ created: [], duplicateCount: 0, savedCount: 1 });

    await saveDomainKeywords(action as SaveSelectedKeywordsAction, {
      researchScope: domainOverviewScopeFixture,
      projectId: "prj_1",
      report: domainOverviewReportFixture,
      rows: [keywords.data.rows[0]],
    });

    expect(action).toHaveBeenCalledWith({
      languageCode: "en",
      locationCode: 2840,
      projectId: "prj_1",
      rows: [
        expect.objectContaining({
          keyword: "standing desk",
          location: "US",
          sourceSeed: "example.com",
          variantCount: 0,
        }),
      ],
      scopeOverride: "root",
      target: "example.com",
    });
  });
});
