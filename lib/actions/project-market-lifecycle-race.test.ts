import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateProjectMarket } from "./project-market-lifecycle";

const mocks = vi.hoisted(() => ({
  getActionActor: vi.fn(),
  projectMarket: { findFirst: vi.fn(), updateMany: vi.fn() },
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
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: (run: (client: unknown) => unknown) =>
      run({ projectMarket: mocks.projectMarket }),
    projectMarket: mocks.projectMarket,
  },
}));
vi.mock("@/lib/markets/registry", () => ({
  listProjectMarkets: vi.fn(),
  pauseProjectMarket: vi.fn(),
  removeProjectMarket: vi.fn(),
  restoreProjectMarket: vi.fn(),
  resumeProjectMarket: vi.fn(),
}));

describe("updateProjectMarket lifecycle race", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActionActor.mockResolvedValue({ id: "user_1" });
    mocks.requireProjectScope.mockResolvedValue({
      id: "project_1",
      publicId: "prj_abcdefghijklmnopqrstuvwx",
    });
    mocks.projectMarket.findFirst.mockResolvedValue({
      futureKeywordDevices: ["desktop", "mobile"],
      id: "market_1",
      locationId: "location_1",
      name: "Malaga core",
      publicId: "pmkt_abcdefghijklmnopqrstuvwx",
      status: "active",
    });
  });

  it("refuses an edit that loses an active-to-removed race without an audit", async () => {
    mocks.projectMarket.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      updateProjectMarket({
        futureKeywordDevices: ["mobile"],
        marketId: "pmkt_abcdefghijklmnopqrstuvwx",
        name: "Malaga core updated",
        projectId: "prj_abcdefghijklmnopqrstuvwx",
      }),
    ).rejects.toThrow("Project market could not be updated.");

    expect(mocks.projectMarket.updateMany).toHaveBeenCalledWith({
      data: { futureKeywordDevices: ["mobile"], name: "Malaga core updated" },
      where: { id: "market_1", projectId: "project_1", status: "active" },
    });
    expect(mocks.writeAudit).not.toHaveBeenCalled();
    expect(mocks.revalidateSettingsViews).not.toHaveBeenCalled();
  });
});
