import { describe, expect, it } from "vitest";
import { newRuleSchema, ruleTemplates } from "./new-rule-data";
import { alertRuleFormServerSchema } from "./schema.server";

const ctrRule = {
  channels: [],
  changePct: 20,
  competitorDomain: null,
  conditionType: "ctr_drop",
  dropPositions: null,
  enabled: true,
  name: "CTR drop",
  projectId: "prj_a00000000000000000000000",
  serpFeature: null,
  severity: "warning",
  targetIds: [],
  targetType: "all",
  template: "ctr",
  thresholdPosition: null,
  topN: null,
} as const;

describe("CTR drop alert schema", () => {
  it("accepts the empty hidden rule id used when creating a rule", () => {
    const result = newRuleSchema.safeParse({ ...ctrRule, ruleId: "" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ruleId).toBeUndefined();
    }
  });

  it("accepts the template defaults in both drawer and server schemas", () => {
    expect(ruleTemplates.ctr.defaults).toMatchObject({ changePct: 20, conditionType: "ctr_drop" });
    expect(newRuleSchema.safeParse(ctrRule).success).toBe(true);
    expect(alertRuleFormServerSchema.safeParse(ctrRule).success).toBe(true);
  });

  it("explains that stored Search Console data depends on traffic sync", () => {
    expect(ruleTemplates.ctr.evalMode).toContain("~3-day lag");
    expect(ruleTemplates.ctr.preview).toContain("requires traffic sync");
    expect(ruleTemplates.ctr.preview).toContain("connected GSC account");
  });

  it("requires a positive CTR drop percentage no greater than 100", () => {
    for (const changePct of [null, 101]) {
      const result = newRuleSchema.safeParse({ ...ctrRule, changePct });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.path[0] === "changePct")).toBe(true);
      }
    }
  });
});
