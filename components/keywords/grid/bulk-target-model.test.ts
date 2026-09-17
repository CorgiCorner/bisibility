import { keywordRows } from "@/components/keywords/keywords-fixtures";
import type { KeywordRow } from "@/lib/queries/keywords";
import { describe, expect, it } from "vitest";
import { bulkTargetView } from "./bulk-target-model";

function row(index: number, targetUrl: string | null): KeywordRow {
  return { ...keywordRows[index], targetUrl } as KeywordRow;
}

describe("bulkTargetView", () => {
  it("offers Set for one keyword without a target", () => {
    expect(bulkTargetView([row(0, null)])).toMatchObject({
      actionKey: "targetSetAction",
      initialValue: "",
      mixed: false,
      submitKey: "targetSetSubmit",
    });
  });

  it("offers Change and prefills one existing target", () => {
    expect(bulkTargetView([row(0, "/rank-tracking")])).toMatchObject({
      actionKey: "targetChangeAction",
      initialValue: "/rank-tracking",
      mixed: false,
      submitKey: "targetChangeSubmit",
    });
  });

  it("offers one shared target for multiple empty values", () => {
    expect(bulkTargetView([row(0, null), row(1, null)])).toMatchObject({
      actionKey: "targetSetSameAction",
      initialValue: "",
      mixed: false,
    });
  });

  it("does not prefill a mixed selection before replacing its targets", () => {
    expect(bulkTargetView([row(0, "/one"), row(1, "/two")])).toMatchObject({
      actionKey: "targetReplaceAction",
      initialValue: "",
      mixed: true,
      submitKey: "targetReplaceSubmit",
    });
  });
});
