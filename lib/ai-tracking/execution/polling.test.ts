import { expect, it } from "vitest";
import { trackingPollDelayMs, trackingSamplePollDelayMs } from "./polling";

it("produces stable bounded exponential jitter across worker restart and workflow replay", () => {
  for (let polls = 1; polls < 40; polls++) {
    const base = Math.min(300_000, 15_000 * 2 ** Math.min(polls, 5));
    const delay = trackingPollDelayMs("retained-attempt", polls);
    expect(delay).toBe(trackingPollDelayMs("retained-attempt", polls));
    expect(delay).toBeGreaterThanOrEqual(base * 0.8);
    expect(delay).toBeLessThanOrEqual(Math.min(300_000, base * 1.2));
  }
  expect(trackingPollDelayMs("attempt-a", 1)).not.toBe(trackingPollDelayMs("attempt-b", 1));
});
it("reconstructs increasing durable task delay from retained claim time", () => {
  const claimed = new Date("2026-10-08T12:00:00Z");
  const initial = trackingSamplePollDelayMs("task", claimed, claimed.getTime());
  const later = trackingSamplePollDelayMs("task", claimed, claimed.getTime() + 90_000);
  expect(later).toBeGreaterThan(initial);
  expect(
    trackingSamplePollDelayMs("task", claimed, claimed.getTime() + 86400_000),
  ).toBeLessThanOrEqual(300_000);
});
