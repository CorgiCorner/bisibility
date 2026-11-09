import { expect, it, vi } from "vitest";
import { comparisonFixture } from "./fixtures.test-support";

const rows = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    providerComparisonRun: { findMany: rows },
    project: { findUnique: async () => ({ domain: "example.com" }) },
  },
}));

import { readPlaygroundCache } from "./playground-cache";

it("reuses only complete provider results for the same query, place and device", async () => {
  const snap = { ...comparisonFixture(), version: 2, keywordId: null };
  const run = {
    id: "r",
    createdAt: new Date(),
    snapshot: snap,
    sides: snap.connections.map((c) => ({
      provider: c.provider,
      status: "completed",
      costCents: null,
      quantity: null,
      reason: null,
      result: { results: [] },
    })),
  };
  rows.mockResolvedValue([run]);
  const input = {
    query: snap.text,
    device: snap.device,
    locationId: snap.locationId,
    providers: ["dataforseo", "serpapi"] as ("dataforseo" | "serpapi")[],
  };
  expect((await readPlaygroundCache("p", input))?.id).toBe("r");
  expect(await readPlaygroundCache("p", { ...input, device: "mobile" })).toBeNull();
  expect(await readPlaygroundCache("p", { ...input, locationId: "different" })).toBeNull();
  expect(await readPlaygroundCache("p", { ...input, providers: ["serpapi"] })).toBeNull();
  run.sides[0].status = "claimed";
  expect(await readPlaygroundCache("p", input)).toBeNull();
});

it("does not reuse a shallower result for a deeper request", async () => {
  const snapshot = { ...comparisonFixture(), version: 2, keywordId: null, depth: 10 };
  rows.mockResolvedValue([
    {
      id: "ten",
      createdAt: new Date(),
      snapshot,
      sides: snapshot.connections.map((side) => ({
        ...side,
        status: "completed",
        costCents: 1,
        quantity: 1,
        reason: null,
        result: { results: [] },
      })),
    },
  ]);
  const input = {
    query: snapshot.text,
    device: snapshot.device,
    locationId: snapshot.locationId,
    providers: ["dataforseo", "serpapi"] as const,
  };
  expect(
    await readPlaygroundCache("p", { ...input, providers: [...input.providers], depth: 100 }),
  ).toBeNull();
  expect(
    (await readPlaygroundCache("p", { ...input, providers: [...input.providers], depth: 10 }))
      ?.depth,
  ).toBe(10);
});
