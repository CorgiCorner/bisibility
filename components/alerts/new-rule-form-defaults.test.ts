import type { AlertRuleView } from "@/lib/alerts/alert-data";
import { describe, expect, it } from "vitest";
import { newRuleFormDefaults } from "./new-rule-form-defaults";

const existingRule: AlertRuleView = {
  channels: [],
  changePct: null,
  conditionType: "enters_top_n",
  competitorDomain: null,
  dropPositions: null,
  enabled: true,
  firedThisWeek: 0,
  id: "alr_a00000000000000000000000",
  marketIds: ["pmkt_current", "pmkt_removed"],
  name: "Top three",
  period: "each_check",
  recipientIds: [],
  scope: { labels: [], targetType: "all" },
  serpFeature: null,
  severity: "warning",
  status: "active",
  targetIds: [],
  targetType: "all",
  thresholdPosition: null,
  topN: 3,
};

describe("newRuleFormDefaults", () => {
  it("prunes market IDs that are no longer present in the project registry", () => {
    expect(
      newRuleFormDefaults("project_1", "top3", existingRule, ["pmkt_current"]).marketIds,
    ).toEqual(["pmkt_current"]);
  });
});
