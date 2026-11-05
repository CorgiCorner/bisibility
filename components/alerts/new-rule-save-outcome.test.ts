import { describe, expect, it } from "vitest";
import { readRuleSaveOutcome } from "./new-rule-save-outcome";

const projectId = "prj_a00000000000000000000000";
const ruleId = "alr_a00000000000000000000000";
const keywordId = "kw_a00000000000000000000000";
const tagId = "tag_a00000000000000000000000";

describe("readRuleSaveOutcome", () => {
  it("keeps keyword public ids on the saved preview", () => {
    const outcome = readRuleSaveOutcome(
      {
        id: ruleId,
        ok: true,
        persisted: {
          conditionType: "position_drop",
          name: "Example drop",
          targetIds: [keywordId],
          targetType: "keyword",
        },
        replayed: true,
      },
      projectId,
      "This rule was already created.",
    );

    expect(outcome).toMatchObject({
      kind: "stay",
      persisted: { targetIds: [keywordId], targetType: "keyword" },
      ruleId,
    });
  });

  it("keeps tag public ids on the saved preview", () => {
    const outcome = readRuleSaveOutcome(
      {
        id: ruleId,
        ok: true,
        persisted: {
          conditionType: "position_drop",
          name: "Example drop",
          targetIds: [tagId],
          targetType: "tag",
        },
        replayed: true,
      },
      projectId,
      "This rule was already created.",
    );

    expect(outcome).toMatchObject({
      kind: "stay",
      persisted: { targetIds: [tagId], targetType: "tag" },
    });
  });
});
