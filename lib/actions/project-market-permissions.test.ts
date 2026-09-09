import { type Action, canProjectAction } from "@/lib/auth/capabilities";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  removeProjectMarketFromProject,
  restoreProjectMarketFromProject,
  setProjectMarketEnabled,
  updateProjectMarket,
} from "./project-market-lifecycle";

const mocks = vi.hoisted(() => ({
  getActionActor: vi.fn(),
  keywordCount: vi.fn(),
  listProjectMarkets: vi.fn(),
  pauseProjectMarket: vi.fn(),
  projectMarket: { findFirst: vi.fn(), updateMany: vi.fn() },
  removeProjectMarket: vi.fn(),
  requireProjectScope: vi.fn(),
  restoreProjectMarket: vi.fn(),
  resumeProjectMarket: vi.fn(),
  revalidateSettingsViews: vi.fn(),
  writeAudit: vi.fn(),
}));

const transactionClient = {
  keyword: { count: mocks.keywordCount },
  projectMarket: { updateMany: mocks.projectMarket.updateMany },
};

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
    $transaction: (run: (client: typeof transactionClient) => unknown) => run(transactionClient),
    projectMarket: mocks.projectMarket,
  },
}));
vi.mock("@/lib/markets/registry", () => ({
  listProjectMarkets: mocks.listProjectMarkets,
  pauseProjectMarket: mocks.pauseProjectMarket,
  removeProjectMarket: mocks.removeProjectMarket,
  restoreProjectMarket: mocks.restoreProjectMarket,
  resumeProjectMarket: mocks.resumeProjectMarket,
}));

const marketId = "pmkt_abcdefghijklmnopqrstuvwx";
const projectId = "prj_abcdefghijklmnopqrstuvwx";
const scope = { id: "project_1", publicId: projectId };

type Mutation = "archive" | "edit" | "pause" | "restore" | "resume";

function setStatus(status: "active" | "paused" | "removed") {
  mocks.projectMarket.findFirst.mockResolvedValue({
    futureKeywordDevices: ["desktop", "mobile"],
    id: "market_1",
    locationId: "location_malaga",
    name: "Malaga core",
    publicId: marketId,
    status,
  });
}

function runMutation(mutation: Mutation) {
  if (mutation === "edit") {
    return updateProjectMarket({
      futureKeywordDevices: ["mobile"],
      marketId,
      name: "Malaga updated",
      projectId,
    });
  }
  if (mutation === "pause") {
    return setProjectMarketEnabled({ enabled: false, marketId, projectId });
  }
  if (mutation === "resume") {
    return setProjectMarketEnabled({ enabled: true, marketId, projectId });
  }
  if (mutation === "archive") {
    return removeProjectMarketFromProject({ marketId, projectId });
  }
  return restoreProjectMarketFromProject({ marketId, projectId });
}

function statusFor(mutation: Mutation) {
  if (mutation === "pause" || mutation === "edit" || mutation === "archive") return "active";
  if (mutation === "resume") return "paused";
  return "removed";
}

function auditActionFor(mutation: Mutation) {
  return `settings.project_market.${
    mutation === "archive" ? "remove" : mutation === "edit" ? "update" : mutation
  }`;
}

function requireRole(role: "admin" | "member") {
  mocks.requireProjectScope.mockImplementation(async (_actor: unknown, action: Action) => {
    if (!canProjectAction(role, action, "project_market")) {
      throw new Error("You are not authorized to perform this action.");
    }
    return scope;
  });
}

describe("project market lifecycle permissions and audits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActionActor.mockResolvedValue({ id: "user_1" });
    mocks.keywordCount.mockResolvedValue(7);
    mocks.listProjectMarkets.mockResolvedValue([{ id: "market_2" }]);
    mocks.pauseProjectMarket.mockResolvedValue({ count: 1 });
    mocks.projectMarket.updateMany.mockResolvedValue({ count: 1 });
    mocks.removeProjectMarket.mockResolvedValue({ count: 1 });
    mocks.restoreProjectMarket.mockResolvedValue({ count: 1 });
    mocks.resumeProjectMarket.mockResolvedValue({ count: 1 });
  });

  it.each(["edit", "pause", "resume"] as const)(
    "allows a member to %s and records exactly one audit",
    async (mutation) => {
      requireRole("member");
      setStatus(statusFor(mutation));

      await expect(runMutation(mutation)).resolves.toBeDefined();

      expect(mocks.writeAudit).toHaveBeenCalledTimes(1);
      expect(mocks.writeAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: auditActionFor(mutation), actorId: "user_1" }),
        transactionClient,
      );
    },
  );

  it.each(["archive", "restore"] as const)(
    "allows an admin to %s and records exactly one audit",
    async (mutation) => {
      requireRole("admin");
      setStatus(statusFor(mutation));

      await expect(runMutation(mutation)).resolves.toBeDefined();

      expect(mocks.writeAudit).toHaveBeenCalledTimes(1);
      expect(mocks.writeAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: auditActionFor(mutation), actorId: "user_1" }),
        transactionClient,
      );
    },
  );

  it("allows a member to archive and records exactly one audit", async () => {
    requireRole("member");
    setStatus(statusFor("archive"));

    await expect(runMutation("archive")).resolves.toBeDefined();

    expect(mocks.writeAudit).toHaveBeenCalledTimes(1);
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: auditActionFor("archive"), actorId: "user_1" }),
      transactionClient,
    );
  });

  it("refuses a member to restore without a mutation or success audit", async () => {
    requireRole("member");
    setStatus(statusFor("restore"));

    await expect(runMutation("restore")).rejects.toThrow("You are not authorized");

    expect(mocks.projectMarket.findFirst).not.toHaveBeenCalled();
    expect(mocks.projectMarket.updateMany).not.toHaveBeenCalled();
    expect(mocks.pauseProjectMarket).not.toHaveBeenCalled();
    expect(mocks.removeProjectMarket).not.toHaveBeenCalled();
    expect(mocks.restoreProjectMarket).not.toHaveBeenCalled();
    expect(mocks.resumeProjectMarket).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it.each(["edit", "pause", "resume", "archive", "restore"] as const)(
    "refuses an unauthenticated %s without a mutation or success audit",
    async (mutation) => {
      mocks.requireProjectScope.mockRejectedValue(new Error("Authentication required."));
      setStatus(statusFor(mutation));

      await expect(runMutation(mutation)).rejects.toThrow("Authentication required.");

      expect(mocks.projectMarket.findFirst).not.toHaveBeenCalled();
      expect(mocks.writeAudit).not.toHaveBeenCalled();
    },
  );
});
