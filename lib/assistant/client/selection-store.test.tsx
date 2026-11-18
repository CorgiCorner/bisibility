import { beforeEach, describe, expect, it } from "vitest";
import {
  assistantSelectionKey,
  parseAssistantSelection,
  resetAssistantSelectionCache,
  writeAssistantSelection,
} from "./selection-store";

beforeEach(() => {
  window.localStorage.clear();
  resetAssistantSelectionCache();
});

describe("assistant selection store", () => {
  it("parses only known efforts and bounded model ids", () => {
    const empty = { modelId: null, effort: null, maxOutputTokens: null };
    expect(parseAssistantSelection(null)).toEqual(empty);
    expect(parseAssistantSelection("not json")).toEqual(empty);
    expect(parseAssistantSelection(JSON.stringify({ modelId: "m", effort: "turbo" }))).toEqual({
      modelId: "m",
      effort: null,
      maxOutputTokens: null,
    });
    expect(parseAssistantSelection(JSON.stringify({ maxOutputTokens: 4096 }))).toMatchObject({
      maxOutputTokens: 4096,
    });
    for (const bad of [0, -1, 1.5, "4096", 20_000_000])
      expect(parseAssistantSelection(JSON.stringify({ maxOutputTokens: bad }))).toEqual(empty);
    expect(
      parseAssistantSelection(JSON.stringify({ modelId: "x".repeat(101), effort: "max" })),
    ).toEqual({
      modelId: null,
      effort: "max",
      maxOutputTokens: null,
    });
  });

  it("stores the pick per project and merges partial updates", () => {
    writeAssistantSelection("prj_a", { modelId: "m1" });
    writeAssistantSelection("prj_a", { effort: "high" });
    writeAssistantSelection("prj_a", { maxOutputTokens: 4096 });
    writeAssistantSelection("prj_b", { modelId: "m2" });
    expect(JSON.parse(window.localStorage.getItem(assistantSelectionKey("prj_a")) ?? "")).toEqual({
      modelId: "m1",
      effort: "high",
      maxOutputTokens: 4096,
    });
    expect(JSON.parse(window.localStorage.getItem(assistantSelectionKey("prj_b")) ?? "")).toEqual({
      modelId: "m2",
      effort: null,
      maxOutputTokens: null,
    });
  });
});
