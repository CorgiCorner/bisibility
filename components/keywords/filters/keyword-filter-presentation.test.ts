import { emptyKeywordFilters } from "@/lib/keywords/keyword-filter-model";
import messages from "@/messages/core/en/project-rank-tracker-keyword-import.json";
import { createTranslator } from "use-intl/core";
import { describe, expect, it } from "vitest";
import { getLocalizedKeywordFilterChips } from "./keyword-filter-presentation";

describe("getLocalizedKeywordFilterChips", () => {
  it("keeps numeric filter values as ICU numbers and resolves labels from the grid catalog", () => {
    const nonEnglishMessages = structuredClone(messages);
    const grid = nonEnglishMessages.projectRankTracker.keywordImport.management.grid;
    grid.filterChipPosition = "Pozycja: {positions}";
    grid.filterPositionTop3 = "Pierwsza trójka";
    grid.filterChipVolume =
      "Wolumen: {minimum, number}k do {isCapped, select, yes {50k+} other {{maximum, number}k}}";
    const t = createTranslator({
      locale: "pl",
      messages: nonEnglishMessages,
      namespace: "projectRankTracker.keywordImport.management.grid",
    });

    expect(
      getLocalizedKeywordFilterChips(
        { ...emptyKeywordFilters, position: ["top3"], volMax: 12, volMin: 1_000 },
        t,
      ),
    ).toEqual([
      { key: "position", label: "Pozycja: Pierwsza trójka" },
      { key: "volume", label: "Wolumen: 1000k do 12k" },
    ]);
  });
});
