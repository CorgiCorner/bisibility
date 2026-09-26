import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: { providerCostEntry: { groupBy: vi.fn() } },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

import { monthlySpendByApiKey } from "./api-key-spend";

describe("monthlySpendByApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("groups the month's project-key cost by credential id", async () => {
    mocks.prisma.providerCostEntry.groupBy.mockResolvedValue([
      { credentialId: "key_1", _sum: { costCents: 123.5 } },
      { credentialId: "key_2", _sum: { costCents: null } },
      { credentialId: null, _sum: { costCents: 40 } },
    ]);

    const spend = await monthlySpendByApiKey("project_1", new Date("2026-08-20T12:00:00.000Z"));

    expect(spend).toEqual(
      new Map([
        ["key_1", 123.5],
        ["key_2", 0],
      ]),
    );
    expect(mocks.prisma.providerCostEntry.groupBy).toHaveBeenCalledWith({
      _sum: { costCents: true },
      by: ["credentialId"],
      where: {
        cached: false,
        measurementStatus: "recorded",
        createdAt: {
          gte: new Date("2026-08-01T00:00:00.000Z"),
          lt: new Date("2026-09-01T00:00:00.000Z"),
        },
        credentialKind: "project_key",
        projectId: "project_1",
      },
    });
  });

  it("returns an empty map when no key has spend", async () => {
    mocks.prisma.providerCostEntry.groupBy.mockResolvedValue([]);

    expect(await monthlySpendByApiKey("project_1")).toEqual(new Map());
  });
});
