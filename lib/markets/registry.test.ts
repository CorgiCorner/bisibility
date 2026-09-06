import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  deleteKeywordHistory: vi.fn(),
  deleteKeywords: vi.fn(),
  makePublicId: vi.fn(() => "pmkt_abcdefghijklmnopqrstuvwx"),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/public-id", () => ({ makePublicId: mocks.makePublicId }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    projectMarket: {
      findMany: mocks.findMany,
      upsert: mocks.upsert,
      update: mocks.update,
      delete: mocks.delete,
    },
    keywordHistory: { deleteMany: mocks.deleteKeywordHistory },
    keyword: { deleteMany: mocks.deleteKeywords },
  },
}));

import { ProjectMarketStatus } from "@/lib/generated/prisma/client";
import { MarketArchivedError } from "./archived";
import {
  ensureActiveProjectMarket,
  ensureKeywordProjectMarketsWithinLimit,
  ensureProjectMarketsWithinLimit,
  listProjectMarkets,
  pauseProjectMarket,
  reconcileProjectMarketsWithinLimit,
  removeProjectMarket,
} from "./registry";

const reference = { projectId: "project_1", locationId: "location_1" };

function archivedRow() {
  return {
    location: { canonicalKey: "ES@es" },
    locationId: "location_1",
    publicId: "pmkt_abcdefghijklmnopqrstuvwx",
    status: ProjectMarketStatus.removed,
  };
}

describe("project market registry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists only visible markets in created-at then ID order", async () => {
    await listProjectMarkets(reference.projectId);

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        projectId: reference.projectId,
        status: { in: [ProjectMarketStatus.active, ProjectMarketStatus.paused] },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  });

  it("uses one compound-unique upsert to add or revive a removed market", async () => {
    const restoredMarket = { id: "market_1", publicId: "pmkt_abcdefghijklmnopqrstuvwx" };
    mocks.upsert.mockResolvedValue(restoredMarket);

    await expect(ensureActiveProjectMarket(reference)).resolves.toBe(restoredMarket);
    await expect(ensureActiveProjectMarket(reference)).resolves.toBe(restoredMarket);

    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.upsert).toHaveBeenNthCalledWith(1, {
      where: { projectId_locationId: reference },
      create: {
        publicId: "pmkt_abcdefghijklmnopqrstuvwx",
        ...reference,
        status: ProjectMarketStatus.active,
      },
      update: { status: ProjectMarketStatus.active },
    });
    expect(mocks.upsert.mock.calls[1]?.[0]?.where).toEqual({ projectId_locationId: reference });
  });

  it("refuses a new location when five visible markets already consume the cap", async () => {
    mocks.findMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, index) => ({ locationId: `location_${index}` })),
    );

    await expect(
      ensureProjectMarketsWithinLimit("project_1", [{ locationId: "location_6" }]),
    ).resolves.toEqual({ code: "market_limit", maxMarkets: 5, ok: false, remaining: 0 });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("deduplicates locations before reviving registry rows", async () => {
    mocks.findMany.mockResolvedValue([]);
    mocks.upsert.mockResolvedValue({ publicId: "pmkt_abcdefghijklmnopqrstuvwx" });

    await expect(
      ensureProjectMarketsWithinLimit("project_1", [
        { locationId: "location_1" },
        { locationId: "location_1" },
      ]),
    ).resolves.toEqual({
      added: 1,
      marketIds: ["pmkt_abcdefghijklmnopqrstuvwx"],
      ok: true,
    });
    expect(mocks.upsert).toHaveBeenCalledOnce();
  });

  it("keeps a visible paused market paused when a keyword write references it", async () => {
    mocks.findMany.mockResolvedValue([
      {
        locationId: "location_1",
        publicId: "pmkt_abcdefghijklmnopqrstuvwx",
        status: ProjectMarketStatus.paused,
      },
    ]);

    await expect(
      ensureKeywordProjectMarketsWithinLimit("project_1", [{ locationId: "location_1" }]),
    ).resolves.toEqual({
      added: 0,
      marketIds: ["pmkt_abcdefghijklmnopqrstuvwx"],
      ok: true,
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("creates a missing active registry row for a keyword write", async () => {
    mocks.findMany.mockResolvedValue([]);
    mocks.upsert.mockResolvedValue({ publicId: "pmkt_abcdefghijklmnopqrstuvwx" });

    await ensureKeywordProjectMarketsWithinLimit("project_1", [{ locationId: "location_1" }]);

    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: ProjectMarketStatus.active }),
        update: { status: ProjectMarketStatus.active },
      }),
    );
  });

  it("keeps a retained visible paused market paused during reconciliation", async () => {
    mocks.findMany.mockResolvedValue([
      {
        locationId: "location_1",
        publicId: "pmkt_abcdefghijklmnopqrstuvwx",
        status: ProjectMarketStatus.paused,
      },
    ]);

    await expect(
      reconcileProjectMarketsWithinLimit("project_1", [{ locationId: "location_1" }]),
    ).resolves.toEqual({
      added: 0,
      marketIds: ["pmkt_abcdefghijklmnopqrstuvwx"],
      ok: true,
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("activates a selected market that is missing or was removed", async () => {
    mocks.findMany.mockResolvedValue([]);
    mocks.upsert.mockResolvedValue({ publicId: "pmkt_abcdefghijklmnopqrstuvwx" });

    await reconcileProjectMarketsWithinLimit("project_1", [{ locationId: "location_1" }]);

    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: ProjectMarketStatus.active }),
        update: { status: ProjectMarketStatus.active },
      }),
    );
  });

  it("refuses a keyword write that would revive an archived market", async () => {
    const stored = [archivedRow()];
    mocks.findMany.mockResolvedValue(stored);

    await expect(
      ensureKeywordProjectMarketsWithinLimit("project_1", [{ locationId: "location_1" }]),
    ).rejects.toMatchObject({
      marketName: "ES@es",
      message: "Market ES@es is not tracked by this project. Add it in Settings > Markets first.",
      name: "MarketArchivedError",
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(stored[0]?.status).toBe(ProjectMarketStatus.removed);
  });

  it("keeps a visible active market untouched when a keyword write references it", async () => {
    mocks.findMany.mockResolvedValue([
      {
        locationId: "location_1",
        publicId: "pmkt_abcdefghijklmnopqrstuvwx",
        status: ProjectMarketStatus.active,
      },
    ]);

    await expect(
      ensureKeywordProjectMarketsWithinLimit("project_1", [{ locationId: "location_1" }]),
    ).resolves.toEqual({
      added: 0,
      marketIds: ["pmkt_abcdefghijklmnopqrstuvwx"],
      ok: true,
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("refuses to create a market whose archived pair already exists", async () => {
    mocks.findMany.mockResolvedValue([archivedRow()]);

    await expect(
      ensureProjectMarketsWithinLimit("project_1", [{ locationId: "location_1" }]),
    ).rejects.toBeInstanceOf(MarketArchivedError);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("refuses an archived market during onboarding reconciliation", async () => {
    mocks.findMany.mockResolvedValue([archivedRow()]);

    await expect(
      reconcileProjectMarketsWithinLimit("project_1", [{ locationId: "location_1" }]),
    ).rejects.toMatchObject({
      marketName: "ES@es",
      message: "Market ES@es is not tracked by this project. Add it in Settings > Markets first.",
      name: "MarketArchivedError",
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("keeps a live market during onboarding reconciliation", async () => {
    mocks.findMany.mockResolvedValue([
      {
        locationId: "location_1",
        publicId: "pmkt_abcdefghijklmnopqrstuvwx",
        status: ProjectMarketStatus.active,
      },
    ]);

    await expect(
      reconcileProjectMarketsWithinLimit("project_1", [{ locationId: "location_1" }]),
    ).resolves.toEqual({
      added: 0,
      marketIds: ["pmkt_abcdefghijklmnopqrstuvwx"],
      ok: true,
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("pauses an existing market without changing its identity", async () => {
    await pauseProjectMarket(reference);

    expect(mocks.update).toHaveBeenCalledWith({
      where: { projectId_locationId: reference },
      data: { status: ProjectMarketStatus.paused },
    });
  });

  it("soft-removes a market without deleting keywords or keyword history", async () => {
    await removeProjectMarket(reference);

    expect(mocks.update).toHaveBeenCalledWith({
      where: { projectId_locationId: reference },
      data: { status: ProjectMarketStatus.removed },
    });
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(mocks.deleteKeywords).not.toHaveBeenCalled();
    expect(mocks.deleteKeywordHistory).not.toHaveBeenCalled();
  });
});
