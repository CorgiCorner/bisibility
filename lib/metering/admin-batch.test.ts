import { expect, it } from "vitest";
import { mapAdminQueries } from "./admin-batch";

it("caps concurrent Meter reads at four and preserves connection/surface order", async () => {
  let active = 0;
  let peak = 0;
  const values = Array.from({ length: 100 }, (_, index) => index);
  const results = await mapAdminQueries(values, async (value) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise<void>((resolve) => setTimeout(resolve, value % 3));
    active--;
    return `${value}:status`;
  });
  expect(peak).toBe(4);
  expect(active).toBe(0);
  expect(results).toEqual(values.map((value) => `${value}:status`));
});

it("waits for in-flight reads after an error and stops scheduling more", async () => {
  let active = 0;
  const started: number[] = [];
  await expect(
    mapAdminQueries(
      Array.from({ length: 20 }, (_, index) => index),
      async (value) => {
        active++;
        started.push(value);
        await new Promise<void>((resolve) => setTimeout(resolve, 1));
        active--;
        if (value === 0) throw new Error("unavailable");
        return value;
      },
    ),
  ).rejects.toThrow("unavailable");
  expect(active).toBe(0);
  expect(started.length).toBeLessThan(20);
});
