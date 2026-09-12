import { beforeEach, describe, expect, it, vi } from "vitest";
import { findStoredBacklinks, listStoredBacklinks } from "./stored";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), findMany: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { backlinkSnapshot: mocks } }));
vi.mock("@/lib/provider-lookups/cache", () => {
  throw new Error("no cache import");
});
vi.mock("@/lib/provider-lookups/paid-call", () => {
  throw new Error("no paid import");
});
vi.mock("./cache", () => {
  throw new Error("no cache helper import");
});
vi.mock("./provider-call", () => {
  throw new Error("no provider call import");
});

const snapshot = {
  expiresAt: new Date("2026-06-02T12:00:00.000Z"),
  fetchedAt: new Date("2026-06-01T12:00:00.000Z"),
  fetchedRowCount: 1,
  history: [],
  includeSubdomains: true,
  projectId: "project_1",
  rows: [
    {
      anchor: "old",
      domainAuthority: 10,
      firstSeen: null,
      flags: [],
      id: "row_1",
      linksCount: 1,
      lostAt: new Date("2026-03-10T00:00:00.000Z"),
      snapshotId: "snapshot_1",
      sourceDomain: "example.org",
      sourceUrl: null,
      spamScore: 0,
      status: "lost",
      targetUrl: "https://example.com/",
    },
  ],
  summary: { _mode: "as_is", _provider: "Stored provider" },
  target: "example.com",
  targetScope: "site",
  totalRowsAvailable: 1,
};

describe("stored backlinks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue(snapshot);
    mocks.findMany.mockResolvedValue([snapshot]);
  });

  it("keeps lost rows visible against their saved reference time", async () => {
    await expect(
      findStoredBacklinks({
        includeSubdomains: true,
        mode: "as_is",
        now: new Date("2026-09-10T12:00:00.000Z"),
        projectId: "project_1",
        target: "example.com",
        targetScope: "site",
      }),
    ).resolves.toMatchObject({ costCents: 0, stale: true, rows: [{ status: "lost" }] });
  });

  it("lists canonical saved requests without internal snapshot IDs", async () => {
    await expect(listStoredBacklinks({ projectId: "project_1" })).resolves.toEqual([
      expect.objectContaining({ mode: "as_is", target: "example.com" }),
    ]);
  });
});
