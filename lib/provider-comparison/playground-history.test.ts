import { expect, it, vi } from "vitest";
import { comparisonFixture } from "./fixtures.test-support";

const mocks = vi.hoisted(() => ({ count: vi.fn(), find: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: async (p: unknown[]) => Promise.all(p),
    providerComparisonRun: { count: mocks.count, findMany: mocks.find },
  },
}));

import { readPlaygroundHistory } from "./playground-history";

it("reads a project-scoped metadata page without loading provider response bodies", async () => {
  mocks.count.mockResolvedValue(100);
  mocks.find.mockResolvedValue([
    {
      id: "run",
      createdAt: new Date("2026-11-09T10:00:00Z"),
      snapshot: { ...comparisonFixture(), version: 2, keywordId: null },
    },
  ]);
  const result = await readPlaygroundHistory("project", "Coffee", 2);
  expect(result.total).toBe(100);
  expect(mocks.find).toHaveBeenCalledWith(
    expect.objectContaining({
      skip: 20,
      take: 10,
      select: { id: true, createdAt: true, snapshot: true },
      where: expect.objectContaining({ projectId: "project", keywordId: null }),
    }),
  );
  expect(result.entries[0]).not.toHaveProperty("sides");
});
