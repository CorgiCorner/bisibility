import { describe, expect, it } from "vitest";
import { planTagMerge, retargetSavedViewConfig } from "./tag-merge-plan";

const source = {
  alertTargets: [
    { id: "alert_shared", ruleId: "rule_shared" },
    { id: "alert_only", ruleId: "rule_only" },
  ],
  id: "tag_source",
  keywordIds: ["keyword_shared", "keyword_only"],
  name: "Docs",
  pageIds: ["page_shared", "page_only"],
  ruleId: "rule_row",
};

describe("planTagMerge", () => {
  it("moves unique links and drops ones the target already has", () => {
    const plan = planTagMerge(
      source,
      {
        alertTargets: [{ id: "alert_target", ruleId: "rule_shared" }],
        id: "tag_target",
        keywordIds: ["keyword_shared"],
        name: "Guides",
        pageIds: ["page_shared"],
        ruleId: null,
      },
      [
        {
          config: { filters: { tags: ["Docs", "Guides"] }, search: "keep" },
          id: "view_both",
          name: "Both",
          surface: "keywords",
        },
        {
          config: { filters: { tags: ["docs"] }, version: 1 },
          id: "view_docs",
          name: "Docs only",
          surface: "pages",
        },
        {
          config: { filters: { tags: ["Other"] } },
          id: "view_other",
          name: "Other",
          surface: "keywords",
        },
      ],
    );

    expect(plan.pageLinksToMove).toEqual(["page_only"]);
    expect(plan.pageLinksToDrop).toEqual(["page_shared"]);
    expect(plan.keywordIds).toEqual(["keyword_shared", "keyword_only"]);
    expect(plan.alertTargetsToMove).toEqual(["alert_only"]);
    expect(plan.alertTargetsToDrop).toEqual(["alert_shared"]);
    expect(plan.moveRule).toBe(true);
    expect(plan.savedViewUpdates).toEqual([
      {
        config: { filters: { tags: ["Guides"] }, search: "keep" },
        id: "view_both",
      },
      {
        config: { filters: { tags: ["Guides"] }, version: 1 },
        id: "view_docs",
      },
    ]);
    expect(plan.counts).toEqual({
      alerts: 2,
      keywordSegments: 1,
      keywords: 2,
      pages: 2,
      savedViews: 1,
    });
  });

  it("keeps the target page rule when both tags have one", () => {
    const plan = planTagMerge(source, { ...source, id: "tag_target", name: "Guides" }, []);
    expect(plan.moveRule).toBe(false);
    expect(plan.pageLinksToMove).toEqual([]);
    expect(plan.pageLinksToDrop).toEqual(source.pageIds);
  });

  it("leaves a saved view unchanged when it does not filter on the source tag", () => {
    expect(retargetSavedViewConfig({ filters: { tags: ["Other"] } }, "Docs", "Guides")).toBeNull();
    expect(retargetSavedViewConfig(null, "Docs", "Guides")).toBeNull();
  });
});
