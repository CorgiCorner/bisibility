import { type Action, canProjectAction } from "@/lib/auth/capabilities";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { restoreProjectMarketFromProject } from "./project-market-lifecycle";

const mocks = vi.hoisted(() => ({
  getActionActor: vi.fn(),
  keywordCount: vi.fn(),
  listProjectMarkets: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    projectMarket: { findFirst: vi.fn() },
  },
  requireProjectScope: vi.fn(),
  restoreProjectMarket: vi.fn(),
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
  ensureProjectMarketsWithinLimit: vi.fn(),
  listProjectMarkets: mocks.listProjectMarkets,
  pauseProjectMarket: vi.fn(),
  reconcileProjectMarketsWithinLimit: vi.fn(),
  removeProjectMarket: vi.fn(),
  restoreProjectMarket: mocks.restoreProjectMarket,
}));
vi.mock("@/lib/serp/location-service", () => ({ resolveKeywordLocation: vi.fn() }));

const marketId = "pmkt_abcdefghijklmnopqrstuvwx";
const projectId = "prj_abcdefghijklmnopqrstuvwx";
/** The client the action must reach every read and write through inside one transaction. */
const tx = { keyword: { count: mocks.keywordCount } };

function scopedMarket(status: "active" | "paused" | "removed") {
  mocks.prisma.projectMarket.findFirst.mockResolvedValue({
    locationId: "location_9",
    publicId: marketId,
    status,
  });
}

function restore() {
  return restoreProjectMarketFromProject({ marketId, projectId });
}

describe("restoreProjectMarketFromProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActionActor.mockResolvedValue({ id: "user_1" });
    mocks.requireProjectScope.mockResolvedValue({ id: "project_1", publicId: projectId });
    mocks.listProjectMarkets.mockResolvedValue([{ locationId: "location_1" }]);
    mocks.keywordCount.mockResolvedValue(7);
    mocks.restoreProjectMarket.mockResolvedValue({ count: 1 });
    mocks.prisma.$transaction.mockImplementation((run: (client: unknown) => unknown) => run(tx));
  });

  it("audits the keywords that resume and reports the count to the caller", async () => {
    scopedMarket("removed");

    await expect(restore()).resolves.toEqual({ resumedKeywords: 7 });

    expect(mocks.keywordCount).toHaveBeenCalledWith({
      where: { archivedAt: null, locationId: "location_9", projectId: "project_1" },
    });
    expect(mocks.restoreProjectMarket).toHaveBeenCalledWith(
      { locationId: "location_9", projectId: "project_1" },
      tx,
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      {
        action: "settings.project_market.restore",
        actorId: "user_1",
        after: { resumedKeywords: 7, status: "active" },
        before: { status: "removed" },
        projectId: "project_1",
        targetId: marketId,
        targetType: "project_market",
      },
      tx,
    );
    expect(mocks.revalidateSettingsViews).toHaveBeenCalledOnce();
  });

  it("takes the cap read, the write and the audit in one serializable transaction", async () => {
    scopedMarket("removed");

    await restore();

    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(mocks.listProjectMarkets).toHaveBeenCalledWith("project_1", tx);
  });

  it("costs the admin capability that archiving a market costs", async () => {
    scopedMarket("removed");

    await restore();

    expect(mocks.requireProjectScope).toHaveBeenCalledWith(expect.anything(), "delete", projectId, {
      type: "project_market",
    });
  });

  it("refuses a member, who cannot archive a market and so cannot lift one", async () => {
    scopedMarket("removed");
    // The real scope check, not a blanket rejection: a member holds update but never delete.
    mocks.requireProjectScope.mockImplementation(async (_actor: unknown, action: Action) => {
      if (!canProjectAction("member", action, "project_market")) {
        throw new Error("You are not authorized to perform this action.");
      }
      return { id: "project_1", publicId: projectId };
    });

    await expect(restore()).rejects.toThrow("You are not authorized to perform this action.");
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.restoreProjectMarket).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it.each(["active", "paused"] as const)("refuses to restore a %s market", async (status) => {
    scopedMarket(status);

    await expect(restore()).rejects.toThrow("Only an archived market can be restored.");
    expect(mocks.restoreProjectMarket).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("refuses and writes no audit when the conditioned write matches no archived row", async () => {
    scopedMarket("removed");
    mocks.restoreProjectMarket.mockResolvedValue({ count: 0 });

    await expect(restore()).rejects.toThrow("Only an archived market can be restored.");
    expect(mocks.writeAudit).not.toHaveBeenCalled();
    expect(mocks.revalidateSettingsViews).not.toHaveBeenCalled();
  });

  it("refuses a restore that would push the registry past the shared cap", async () => {
    scopedMarket("removed");
    mocks.listProjectMarkets.mockResolvedValue(
      Array.from({ length: 5 }, (_, index) => ({ locationId: `location_${index}` })),
    );

    await expect(restore()).rejects.toThrow("This project can track up to 5 markets.");
    expect(mocks.restoreProjectMarket).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("refuses a market the project scope does not own", async () => {
    mocks.prisma.projectMarket.findFirst.mockResolvedValue(null);

    await expect(restore()).rejects.toThrow("Project market not found.");
    expect(mocks.restoreProjectMarket).not.toHaveBeenCalled();
  });
});
