import { beforeEach, describe, expect, it, vi } from "vitest";
import { removeProjectMarketFromProject } from "./project-market-lifecycle";

const mocks = vi.hoisted(() => ({
  getActionActor: vi.fn(),
  prisma: { $transaction: vi.fn(), projectMarket: { findFirst: vi.fn() } },
  removeProjectMarket: vi.fn(),
  requireProjectScope: vi.fn(),
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
  listProjectMarkets: vi.fn(),
  pauseProjectMarket: vi.fn(),
  removeProjectMarket: mocks.removeProjectMarket,
  restoreProjectMarket: vi.fn(),
  resumeProjectMarket: vi.fn(),
}));

const marketId = "pmkt_abcdefghijklmnopqrstuvwx";
const projectId = "prj_abcdefghijklmnopqrstuvwx";

describe("removeProjectMarketFromProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActionActor.mockResolvedValue({ id: "user_admin" });
    mocks.requireProjectScope.mockResolvedValue({ id: "project_1", publicId: projectId });
    mocks.prisma.projectMarket.findFirst.mockResolvedValue({
      futureKeywordDevices: ["desktop", "mobile"],
      id: "market_1",
      locationId: "location_malaga",
      name: "Malaga core",
      publicId: marketId,
      status: "active",
    });
    mocks.prisma.$transaction.mockImplementation((run: (client: object) => unknown) => run({}));
    mocks.removeProjectMarket.mockResolvedValue({ count: 1 });
  });

  it("requires member archive permission and emits one success audit for an allowed archive", async () => {
    await expect(removeProjectMarketFromProject({ marketId, projectId })).resolves.toEqual({
      status: "removed",
    });

    expect(mocks.requireProjectScope).toHaveBeenCalledWith(expect.anything(), "update", projectId, {
      type: "project_market",
    });
    expect(mocks.removeProjectMarket).toHaveBeenCalledWith(
      { locationId: "location_malaga", projectId: "project_1" },
      {},
    );
    expect(mocks.writeAudit).toHaveBeenCalledTimes(1);
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "settings.project_market.remove",
        after: { status: "removed" },
        before: { status: "active" },
      }),
      {},
    );
  });

  it("rejects a member without a project scope before any write or success audit", async () => {
    mocks.requireProjectScope.mockRejectedValue(
      new Error("You are not authorized to perform this action."),
    );

    await expect(removeProjectMarketFromProject({ marketId, projectId })).rejects.toThrow(
      "You are not authorized to perform this action.",
    );

    expect(mocks.prisma.projectMarket.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.removeProjectMarket).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("does not revalidate views after an audit failure rolls the archive transaction back", async () => {
    mocks.writeAudit.mockRejectedValue(new Error("audit unavailable"));

    await expect(removeProjectMarketFromProject({ marketId, projectId })).rejects.toThrow(
      "audit unavailable",
    );

    expect(mocks.revalidateSettingsViews).not.toHaveBeenCalled();
  });
});
