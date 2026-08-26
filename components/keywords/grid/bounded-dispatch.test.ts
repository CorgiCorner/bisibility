import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./bounded-dispatch";

describe("mapWithConcurrency", () => {
  it("keeps at most five dispatches active and preserves result order", async () => {
    let active = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    const work = Array.from({ length: 12 }, (_, index) => index);
    const promise = mapWithConcurrency(work, 5, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
      return value * 2;
    });

    await Promise.resolve();
    expect(active).toBe(5);
    while (releases.length) {
      releases.shift()?.();
      await Promise.resolve();
      await Promise.resolve();
    }
    expect(await promise).toEqual(work.map((value) => ({ status: "fulfilled", value: value * 2 })));
    expect(peak).toBe(5);
  });
});
