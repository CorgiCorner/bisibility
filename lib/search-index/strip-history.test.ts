import { expect, it, vi } from "vitest";
import { storedStripHistory } from "./strip-history";

const state = vi.hoisted(() => ({ anchor: vi.fn(), recent: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { urlPresenceChange: { findFirst: state.anchor, findMany: state.recent } },
}));
it("includes the latest old state before the window and every recent row, without the REST cap", async () => {
  const baseline = { at: new Date("2025-01-01"), previous: null, next: { verdict: "PASS" } };
  const recent = Array.from({ length: 110 }, (_, i) => ({
    at: new Date(`2026-10-24T12:00:${String(i % 60).padStart(2, "0")}Z`),
    previous: {},
    next: { verdict: "FAIL" },
  }));
  state.anchor.mockResolvedValue(baseline);
  state.recent.mockResolvedValue(recent);
  const now = new Date("2026-10-24T13:00:00Z");
  expect(await storedStripHistory("p", "https://example.com/", now)).toEqual([baseline, ...recent]);
  expect(state.recent).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ at: { gte: expect.any(Date), lte: now } }),
    }),
  );
  expect(state.recent.mock.lastCall?.[0]).not.toHaveProperty("take");
});
