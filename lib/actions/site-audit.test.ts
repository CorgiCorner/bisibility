import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  scope: vi.fn(),
  cancel: vi.fn(),
  resume: vi.fn(),
  pages: vi.fn(),
  run: vi.fn(),
}));
vi.mock("./_shared", () => ({
  getActionActor: async () => ({ id: "actor" }),
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
  requireProjectScope: mocks.scope,
}));
vi.mock("@/lib/achievements/record-use", () => ({
  withAchievementUse: (_actor: unknown, _action: unknown, _cached: unknown, run: () => unknown) =>
    run(),
}));
vi.mock("@/lib/site-audit/service", () => ({
  runSiteAudit: mocks.run,
  listSiteAudits: vi.fn(),
  readSiteAudit: vi.fn(),
}));
vi.mock("@/lib/site-audit/runs", () => ({
  cancelSiteAuditRun: mocks.cancel,
  resumeSiteAuditRun: mocks.resume,
  listSiteAuditRunPages: mocks.pages,
}));

import { CapacityLimitError } from "@/lib/capacity/errors";
import * as actions from "./site-audit";

const controls = {
  cancelSiteAuditAction: actions.cancelSiteAuditAction,
  resumeSiteAuditAction: actions.resumeSiteAuditAction,
  listSiteAuditPagesAction: actions.listSiteAuditPagesAction,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.scope.mockResolvedValue({ id: "internal", writeMode: "active" });
});
describe("site audit worker server actions", () => {
  it.each(["run", "resume"] as const)(
    "serializes %s capacity denial for production action transport",
    async (name) => {
      const error = new CapacityLimitError({
        dimension: "concurrentCrawls",
        limit: 1,
        used: 1,
        requested: 1,
        scope: "account",
        upgradeUrl: "/pricing",
      });
      mocks[name].mockRejectedValue(error);
      const result =
        name === "run"
          ? await actions.runSiteAuditAction({ projectId: "prj_one" })
          : await actions.resumeSiteAuditAction({ projectId: "prj_one", reportId: "agr_one" });
      expect(JSON.parse(JSON.stringify(result))).toMatchObject({
        ok: false,
        capacityFailure: { code: "plan_limit_reached", details: error.toJSON() },
      });
    },
  );
  it.each([
    ["cancelSiteAuditAction", "create", "cancel"],
    ["resumeSiteAuditAction", "create", "resume"],
    ["listSiteAuditPagesAction", "read", "pages"],
  ] as const)(
    "%s authorizes the project before passing its internal ID",
    async (name, permission, service) => {
      const action = controls[name];
      expect(action).toBeTypeOf("function");
      await action({
        projectId: "prj_one",
        reportId: "agr_one",
        ...(service === "pages" ? { offset: 15, limit: 15 } : {}),
      });
      expect(mocks.scope).toHaveBeenCalledWith({ id: "actor" }, permission, "prj_one", {
        type: "project",
      });
      expect(mocks[service]).toHaveBeenCalledWith(
        "internal",
        "agr_one",
        ...(service === "pages" ? [15, 15] : [{ actorId: "actor" }]),
      );
    },
  );
  it("does not resume a read-only project", async () => {
    mocks.scope.mockResolvedValue({ id: "internal", writeMode: "migration_hold" });
    expect(actions.resumeSiteAuditAction).toBeTypeOf("function");
    await expect(
      actions.resumeSiteAuditAction({ projectId: "prj_one", reportId: "agr_one" }),
    ).rejects.toThrow();
    expect(mocks.resume).not.toHaveBeenCalled();
  });
  it("rejects an unbounded page request before authorization or lookup", async () => {
    expect(actions.listSiteAuditPagesAction).toBeTypeOf("function");
    await expect(
      actions.listSiteAuditPagesAction({
        projectId: "prj_one",
        reportId: "agr_one",
        offset: -1,
        limit: 101,
      }),
    ).rejects.toThrow();
    expect(mocks.scope).not.toHaveBeenCalled();
    expect(mocks.pages).not.toHaveBeenCalled();
  });
  it("does not mutate when project authorization fails", async () => {
    mocks.scope.mockRejectedValue(new Error("forbidden"));
    expect(actions.cancelSiteAuditAction).toBeTypeOf("function");
    await expect(
      actions.cancelSiteAuditAction({ projectId: "prj_one", reportId: "agr_one" }),
    ).rejects.toThrow("forbidden");
    expect(mocks.cancel).not.toHaveBeenCalled();
  });
});
