import { projectMarketAddResult } from "@/lib/markets/project-market-add-result";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addProjectMarkets,
  reconcileProjectMarkets,
  setProjectMarketEnabled,
} from "./project-markets";

const mocks = vi.hoisted(() => ({
  ensureProjectMarketsWithinLimit: vi.fn(),
  getActionActor: vi.fn(),
  listProjectMarkets: vi.fn(),
  pauseProjectMarket: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    projectMarket: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  },
  requireProjectScope: vi.fn(),
  reconcileProjectMarketsWithinLimit: vi.fn(),
  resolveKeywordLocation: vi.fn(),
  revalidateSettingsViews: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: mocks.getActionActor,
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
  requireProjectScope: mocks.requireProjectScope,
  revalidateSettingsViews: mocks.revalidateSettingsViews,
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/markets/registry", () => ({
  ensureProjectMarketsWithinLimit: mocks.ensureProjectMarketsWithinLimit,
  listProjectMarkets: mocks.listProjectMarkets,
  pauseProjectMarket: mocks.pauseProjectMarket,
  reconcileProjectMarketsWithinLimit: mocks.reconcileProjectMarketsWithinLimit,
  removeProjectMarket: vi.fn(),
}));
vi.mock("@/lib/serp/location-service", () => ({
  resolveKeywordLocation: mocks.resolveKeywordLocation,
}));

const projectId = "prj_abcdefghijklmnopqrstuvwx";
const choice = {
  canonicalKey: "ES",
  countryCode: "ES",
  kind: "country" as const,
  languageCode: "es",
};

describe("project market actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActionActor.mockResolvedValue({ id: "user_1" });
    mocks.requireProjectScope.mockResolvedValue({ id: "project_1", publicId: projectId });
    mocks.resolveKeywordLocation.mockResolvedValue({ location: { id: "location_5" } });
    mocks.listProjectMarkets.mockImplementation((_projectId: string, client: typeof mocks.prisma) =>
      client.projectMarket.findMany(),
    );
    mocks.prisma.$transaction.mockImplementation(async (callback: (tx: object) => unknown) =>
      callback({ auditLog: {}, projectMarket: mocks.prisma.projectMarket }),
    );
    mocks.ensureProjectMarketsWithinLimit.mockResolvedValue({
      added: 1,
      marketIds: ["pmkt_abcdefghijklmnopqrstuvwx"],
      ok: true,
    });
    mocks.reconcileProjectMarketsWithinLimit.mockResolvedValue({
      added: 1,
      marketIds: ["pmkt_abcdefghijklmnopqrstuvwx"],
      ok: true,
    });
  });

  it("returns an explicit result without writing when additions exceed the shared cap", async () => {
    mocks.ensureProjectMarketsWithinLimit.mockResolvedValue({
      code: "market_limit",
      maxMarkets: 5,
      ok: false,
      remaining: 0,
    });
    mocks.resolveKeywordLocation
      .mockResolvedValueOnce({ location: { id: "location_6" } })
      .mockResolvedValueOnce({ location: { id: "location_7" } });

    await expect(
      addProjectMarkets({ choices: [choice, { ...choice, languageCode: "en" }], projectId }),
    ).resolves.toEqual({
      code: "market_limit",
      maxMarkets: 5,
      ok: false,
      remaining: 0,
    });
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("rechecks the cap after a serializable race before making an additional write", async () => {
    mocks.prisma.$transaction
      .mockRejectedValueOnce({ code: "P2034" })
      .mockImplementationOnce(async (callback: (tx: object) => unknown) =>
        callback({ projectMarket: {} }),
      );
    mocks.resolveKeywordLocation.mockResolvedValue({ location: { id: "location_6" } });
    mocks.ensureProjectMarketsWithinLimit.mockResolvedValue({
      code: "market_limit",
      maxMarkets: 5,
      ok: false,
      remaining: 0,
    });

    await expect(addProjectMarkets({ choices: [choice], projectId })).resolves.toMatchObject({
      code: "market_limit",
      ok: false,
    });
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it("deduplicates aliases before the cap check and revives the resolved registry row", async () => {
    await expect(
      addProjectMarkets({ choices: [choice, { ...choice, canonicalKey: "ES@es" }], projectId }),
    ).resolves.toEqual({
      added: 1,
      marketIds: ["pmkt_abcdefghijklmnopqrstuvwx"],
      ok: true,
    });
    expect(mocks.requireProjectScope).toHaveBeenCalledWith(expect.anything(), "create", projectId, {
      type: "project_market",
    });
    expect(mocks.ensureProjectMarketsWithinLimit).toHaveBeenCalledOnce();
  });

  it("transactionally reconciles selected markets and audits omitted active or paused rows", async () => {
    mocks.resolveKeywordLocation
      .mockResolvedValueOnce({ location: { id: "location_1" } })
      .mockResolvedValueOnce({ location: { id: "location_3" } });
    mocks.prisma.projectMarket.findMany.mockResolvedValue([
      { locationId: "location_1", publicId: "pmkt_1", status: "active" },
      { locationId: "location_2", publicId: "pmkt_2", status: "paused" },
    ]);
    mocks.reconcileProjectMarketsWithinLimit.mockResolvedValue({
      added: 1,
      marketIds: ["pmkt_1", "pmkt_3"],
      ok: true,
    });

    await expect(
      reconcileProjectMarkets({
        choices: [choice, { ...choice, canonicalKey: "DE", countryCode: "DE" }],
        projectId,
      }),
    ).resolves.toEqual({ marketIds: ["pmkt_1", "pmkt_3"], removedMarketIds: ["pmkt_2"] });

    expect(mocks.requireProjectScope).toHaveBeenCalledWith(expect.anything(), "create", projectId, {
      type: "project_market",
    });
    expect(mocks.requireProjectScope).toHaveBeenCalledWith(expect.anything(), "delete", projectId, {
      type: "project_market",
    });
    expect(mocks.prisma.projectMarket.updateMany).toHaveBeenCalledWith({
      data: { status: "removed" },
      where: {
        locationId: { in: ["location_2"] },
        projectId: "project_1",
        status: { in: ["active", "paused"] },
      },
    });
    expect(mocks.reconcileProjectMarketsWithinLimit).toHaveBeenCalledWith(
      "project_1",
      [{ locationId: "location_1" }, { locationId: "location_3" }],
      expect.objectContaining({ projectMarket: mocks.prisma.projectMarket }),
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "onboarding.project_markets.reconcile",
        after: expect.objectContaining({ removedMarketIds: ["pmkt_2"] }),
        before: { marketIds: ["pmkt_1", "pmkt_2"] },
      }),
      expect.objectContaining({ projectMarket: mocks.prisma.projectMarket }),
    );
    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });

  it("does not audit a reconciliation rejected by the shared cap", async () => {
    mocks.prisma.projectMarket.findMany.mockResolvedValue([]);
    mocks.reconcileProjectMarketsWithinLimit.mockResolvedValue({
      code: "market_limit",
      maxMarkets: 5,
      ok: false,
      remaining: 0,
    });

    await expect(reconcileProjectMarkets({ choices: [choice], projectId })).rejects.toThrow(
      "This project can track up to 5 markets.",
    );
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("rejects reconciliation when create and delete scopes resolve to different projects", async () => {
    mocks.requireProjectScope
      .mockResolvedValueOnce({ id: "project_1", publicId: projectId })
      .mockResolvedValueOnce({ id: "project_2", publicId: projectId });

    await expect(reconcileProjectMarkets({ choices: [choice], projectId })).rejects.toThrow(
      "Project market scope changed.",
    );
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("scopes pause to the requested project market before changing status", async () => {
    mocks.prisma.projectMarket.findFirst.mockResolvedValue({
      locationId: "location_1",
      publicId: "pmkt_abcdefghijklmnopqrstuvwx",
      status: "active",
    });
    mocks.pauseProjectMarket.mockResolvedValue({ status: "paused" });

    await setProjectMarketEnabled({
      enabled: false,
      marketId: "pmkt_abcdefghijklmnopqrstuvwx",
      projectId,
    });

    expect(mocks.requireProjectScope).toHaveBeenCalledWith(expect.anything(), "update", projectId, {
      type: "project_market",
    });
    expect(mocks.prisma.projectMarket.findFirst).toHaveBeenCalledWith({
      select: { locationId: true, publicId: true, status: true },
      where: { projectId: "project_1", publicId: "pmkt_abcdefghijklmnopqrstuvwx" },
    });
  });

  it("rejects resuming a removed market when the registry cap is full", async () => {
    mocks.prisma.projectMarket.findFirst.mockResolvedValue({
      locationId: "location_6",
      publicId: "pmkt_abcdefghijklmnopqrstuvwx",
      status: "removed",
    });
    mocks.ensureProjectMarketsWithinLimit.mockResolvedValue({
      code: "market_limit",
      maxMarkets: 5,
      ok: false,
      remaining: 0,
    });

    await expect(
      setProjectMarketEnabled({
        enabled: true,
        marketId: "pmkt_abcdefghijklmnopqrstuvwx",
        projectId,
      }),
    ).rejects.toThrow("This project can track up to 5 markets.");
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("counts only new resolved locations toward the cap", () => {
    expect(
      projectMarketAddResult(
        ["location_1", "location_2", "location_3", "location_4"],
        [{ locationId: "location_4" }, { locationId: "location_5" }],
      ),
    ).toEqual({ added: 1, marketIds: [], ok: true });
  });
});
