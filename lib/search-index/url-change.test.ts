import { expect, it } from "vitest";
import { latestTrackedChange } from "./url-change";

it("chooses the newest tracked change, excluding initial baselines", () => {
  expect(
    latestTrackedChange([
      { at: new Date("2026-10-23"), previous: {}, next: { verdict: "PASS" } },
      { at: new Date("2026-10-20"), previous: { verdict: "PASS" }, next: { verdict: "NEUTRAL" } },
      { at: new Date("2026-10-18"), previous: { verdict: "NEUTRAL" }, next: { verdict: "PASS" } },
    ]),
  ).toEqual({ at: new Date("2026-10-20"), kind: "dropped" });
  expect(latestTrackedChange([])).toBeNull();
});
it("labels indexing and non-verdict tracked transitions separately", () => {
  const at = new Date("2026-10-22");
  expect(
    latestTrackedChange([{ at, previous: { verdict: "NEUTRAL" }, next: { verdict: "PASS" } }])
      ?.kind,
  ).toBe("indexed");
  expect(
    latestTrackedChange([
      {
        at,
        previous: { verdict: "PASS", googleCanonical: "a" },
        next: { verdict: "PASS", googleCanonical: "b" },
      },
    ])?.kind,
  ).toBe("changed");
});
