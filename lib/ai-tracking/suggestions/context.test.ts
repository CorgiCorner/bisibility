import { describe, expect, it } from "vitest";
import { contextSuggestions, deduplicateSuggestions } from "./context";

describe("context prompt drafts", () => {
  it("offers neutral/branded/comparative drafts as hypotheses requiring acceptance", () => {
    const drafts = contextSuggestions({
      brand: "Acme",
      offering: "rank tracking",
      competitors: ["Example"],
    });
    expect(drafts.map((draft) => draft.category)).toEqual(["neutral", "branded", "comparative"]);
    expect(
      drafts.every(
        (draft) =>
          draft.provenance === "generated_hypothesis" &&
          draft.popularity === null &&
          !draft.accepted,
      ),
    ).toBe(true);
    expect(contextSuggestions({ brand: "Acme", offering: " " })).toEqual([]);
  });
  it("deduplicates unicode, whitespace and case variants", () => {
    const draft = contextSuggestions({ brand: "Acme", offering: "rank tracking" })[0];
    expect(
      deduplicateSuggestions([draft, { ...draft, text: ` ${draft.text.toUpperCase()} ` }]),
    ).toHaveLength(1);
  });
});
