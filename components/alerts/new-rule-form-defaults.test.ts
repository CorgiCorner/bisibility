import type { AlertRuleView } from "@/lib/alerts/alert-data";
import { describe, expect, it } from "vitest";
import { newRuleFormDefaults } from "./new-rule-form-defaults";

const existingRule: AlertRuleView = {
  channel: "In-app",
  channels: [],
  changePct: null,
  condition: "rank enters top 3",
  conditionType: "enters_top_n",
  competitorDomain: null,
  dropPositions: null,
  enabled: true,
  fires: "0 this week",
  id: "alr_a00000000000000000000000",
  marketIds: ["pmkt_current", "pmkt_removed"],
  name: "Top three",
  period: "Each check",
  recipientIds: [],
  scope: "All keywords",
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
