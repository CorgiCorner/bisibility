import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { describe, expect, it } from "vitest";
import {
  comparisonAriaLabel,
  comparisonTargets,
  marketComparisonData,
} from "./market-position-history";

function market(id: string, canonicalKey: string, position: number, device = "Desktop") {
  return {
    ...keywordRows[0],
    device,
    id,
    location: {
      ...keywordRows[0].location,
      canonicalKey,
      displayName: id,
      languageLabel: "English",
    },
    position,
  };
}

describe("market position history", () => {
  it("keeps one same-device target per market", () => {
    const active = market("United States", "country:US:lang:en", 3);
    const targets = comparisonTargets(
      [
        active,
        market("US mobile", "country:US:lang:en", 4, "Mobile"),
        market("Belgium", "country:BE:lang:nl", 9),
      ],
      active,
    );
    expect(targets.map((target) => target.id)).toEqual(["United States", "Belgium"]);
    expect(comparisonAriaLabel(targets)).toContain("Belgium / English #9");
  });

  it("aligns each market to the shared date labels without inventing positions", () => {
    const first = {
      ...market("United States", "country:US:lang:en", 3),
      positionHistory: [
        { checkedAt: "2026-08-13T10:00:00.000Z", label: "Aug 13", position: 4 },
        { checkedAt: "2026-08-14T10:00:00.000Z", label: "Today", position: 3 },
      ],
    };
    const second = {
      ...market("Belgium", "country:BE:lang:nl", 9),
      positionHistory: [{ checkedAt: "2026-08-14T11:00:00.000Z", label: "Today", position: 9 }],
    };
    const comparison = marketComparisonData([first, second], 30);
    expect(comparison.labels).toEqual(["Aug 13", "Today"]);
    expect(comparison.values[0]?.data).toEqual([4, 3]);
    expect(comparison.values[1]?.data).toEqual([null, 9]);
  });
});
