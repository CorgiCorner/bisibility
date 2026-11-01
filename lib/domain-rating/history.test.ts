import { describe, expect, it } from "vitest";
import { buildRatingSeries } from "./history";

describe("rating history", () => {
  it("retains genuine zero, adds missing days as gaps, and never joins failed observations", () => {
    expect(
      buildRatingSeries(
        [
          { day: "2026-10-25", rating: 0 },
          { day: "2026-10-27", rating: null },
          { day: "2026-10-28", rating: 24.5 },
        ],
        "2026-10-28",
        30,
      ),
    ).toEqual([
      { day: "2026-10-25", rating: 0 },
      { day: "2026-10-26", rating: null },
      { day: "2026-10-27", rating: null },
      { day: "2026-10-28", rating: 24.5 },
    ]);
  });
  it("keeps empty histories empty", () => {
    expect(buildRatingSeries([], "2026-10-28", 30)).toEqual([]);
  });
});
