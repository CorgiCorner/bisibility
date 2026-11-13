import { auditEventMessageKeyFor } from "@/lib/audit/event-presentation";
import { primaryConversionSignalPayload } from "@/lib/conversions/types";
import projectAudit from "@/messages/core/en/project-audit.json";
import projectSettingsAdvanced from "@/messages/core/en/project-settings-advanced.json";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  setPrimaryConversionSource,
  syncConversionSource,
  updateConversionGoal,
} from "./conversions";

const projectId = "prj_abcdefghijklmnopqrstuvwx";
const mocks = vi.hoisted(() => ({
  emitSignal: vi.fn(),
  getActionActor: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    conversionDaily: { deleteMany: vi.fn(), findFirst: vi.fn() },
    conversionGoal: { findFirst: vi.fn(), update: vi.fn() },
    projectDefaults: { findUnique: vi.fn(), upsert: vi.fn() },
    providerConnection: { findUnique: vi.fn() },
  },
  projectGa4: vi.fn(),
  recordAppAction: vi.fn(),
  requireProjectScope: vi.fn(),
  syncPlausible: vi.fn(),
  revalidateSettingsViews: vi.fn(),
  revalidateTimelineViews: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: mocks.getActionActor,
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
  requireProjectScope: mocks.requireProjectScope,
  revalidateSettingsViews: mocks.revalidateSettingsViews,
  revalidateTimelineViews: mocks.revalidateTimelineViews,
}));
vi.mock("@/lib/activity/app-mutation", () => ({ recordAppAction: mocks.recordAppAction }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/signals/emit", () => ({ emitSignal: mocks.emitSignal }));
vi.mock("@/lib/conversions/ga4", () => ({ projectGa4KeyEvents: mocks.projectGa4 }));
vi.mock("@/lib/conversions/plausible-sync", () => ({
  syncPlausibleConversions: mocks.syncPlausible,
}));

describe("conversion actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
    mocks.getActionActor.mockResolvedValue({ id: "user_1" });
    mocks.requireProjectScope.mockResolvedValue({ id: "project_1", publicId: projectId });
    mocks.prisma.providerConnection.findUnique.mockResolvedValue({
      enabled: true,
      kind: "analytics",
      status: "connected",
    });
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue({ primaryConversionSource: null });
    mocks.prisma.conversionGoal.findFirst.mockResolvedValue({
      countsRevenue: false,
      displayName: "Key events",
      enabled: true,
      id: "goal_1",
      source: "ga4",
      sourceName: "key_events",
    });
  });

  it("publishes the same audit labels in both catalogs", () => {
    expect(auditEventMessageKeyFor("conversion.primary.update")).toBe("conversionPrimaryUpdated");
    expect(auditEventMessageKeyFor("conversion.goal.update")).toBe("conversionGoalUpdated");
    expect(auditEventMessageKeyFor("conversion.sync_now")).toBe("conversionSourceSynced");
    const audit = projectAudit.projectAudit.presentation.event;
    const advanced = projectSettingsAdvanced.projectSettingsAdvanced.audit.event;
    expect(audit.conversionPrimaryUpdated).toBe("Primary conversion source changed");
    expect(audit.conversionGoalUpdated).toBe("Conversion goal updated");
    expect(advanced.conversionPrimaryUpdated).toBe(audit.conversionPrimaryUpdated);
    expect(advanced.conversionGoalUpdated).toBe(audit.conversionGoalUpdated);
  });

  it("writes one annotation when the primary source changes and deletes nothing", async () => {
    await expect(setPrimaryConversionSource({ projectId, source: "ga4" })).resolves.toEqual({
      ok: true,
    });
    expect(mocks.emitSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: primaryConversionSignalPayload(null, "ga4"),
        source: "manual",
        type: "note",
      }),
      mocks.prisma,
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "conversion.primary.update",
        after: { primaryConversionSource: "ga4" },
        before: { primaryConversionSource: null },
        targetId: projectId,
        targetType: "project_defaults",
      }),
      mocks.prisma,
    );
    expect(mocks.recordAppAction).toHaveBeenCalledWith({ id: "user_1" });
    expect(mocks.prisma.conversionDaily.deleteMany).not.toHaveBeenCalled();
    expect(primaryConversionSignalPayload("ga4", "plausible")).toEqual({
      from: "ga4",
      generated: "primaryConversion",
      to: "plausible",
    });
  });

  it("does not annotate the same primary source again", async () => {
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue({ primaryConversionSource: "ga4" });
    await expect(setPrimaryConversionSource({ projectId, source: "ga4" })).resolves.toEqual({
      ok: true,
      unchanged: true,
    });
    expect(mocks.emitSignal).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
    expect(mocks.recordAppAction).not.toHaveBeenCalled();
    expect(mocks.prisma.projectDefaults.upsert).not.toHaveBeenCalled();
  });

  it("rejects a disconnected source before writing", async () => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue({
      enabled: true,
      kind: "analytics",
      status: "ready",
    });
    await expect(setPrimaryConversionSource({ projectId, source: "plausible" })).resolves.toEqual({
      error: "not_connected",
      ok: false,
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("stops before writing when the project scope is read-only or forbidden", async () => {
    mocks.requireProjectScope.mockRejectedValue(new Error("read-only"));
    await expect(setPrimaryConversionSource({ projectId, source: "ga4" })).rejects.toThrow(
      "read-only",
    );
    await expect(
      updateConversionGoal({ displayName: "Purchases", goalId: "goal_1", projectId }),
    ).rejects.toThrow("read-only");
    expect(mocks.writeAudit).not.toHaveBeenCalled();
    expect(mocks.recordAppAction).not.toHaveBeenCalled();
  });

  it("audits a goal rename and records the activity", async () => {
    await expect(
      updateConversionGoal({ displayName: "Purchases", goalId: "goal_1", projectId }),
    ).resolves.toEqual({ ok: true });
    expect(mocks.prisma.conversionGoal.update).toHaveBeenCalledWith({
      data: { countsRevenue: false, displayName: "Purchases", enabled: true },
      where: { id: "goal_1" },
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "conversion.goal.update",
        after: expect.objectContaining({ displayName: "Purchases" }),
        targetType: "project_defaults",
      }),
    );
    expect(mocks.recordAppAction).toHaveBeenCalledWith({ id: "user_1" });
  });

  it("rejects revenue for a source that does not report it", async () => {
    await expect(
      updateConversionGoal({ countsRevenue: true, goalId: "goal_1", projectId }),
    ).resolves.toEqual({ error: "revenue", ok: false });
    expect(mocks.prisma.conversionGoal.update).not.toHaveBeenCalled();
    expect(mocks.recordAppAction).not.toHaveBeenCalled();
  });

  it("reprojects GA4 key events when that source is synced", async () => {
    mocks.projectGa4.mockResolvedValue({ created: 0, deleted: 0, updated: 0 });
    await expect(syncConversionSource({ projectId, source: "ga4" })).resolves.toEqual({ ok: true });
    expect(mocks.projectGa4).toHaveBeenCalledWith("project_1");
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "conversion.sync_now", after: { source: "ga4" } }),
    );
  });

  it("syncs a connected Plausible source and records the action", async () => {
    mocks.syncPlausible.mockResolvedValue({ ok: true });
    await expect(syncConversionSource({ projectId, source: "plausible" })).resolves.toEqual({
      ok: true,
    });
    expect(mocks.syncPlausible).toHaveBeenCalledWith("project_1");
    expect(mocks.recordAppAction).toHaveBeenCalledWith({ id: "user_1" });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "conversion.sync_now",
        after: { source: "plausible" },
      }),
    );
  });

  it("leaves stored conversions alone when the Plausible sync fails", async () => {
    mocks.syncPlausible.mockResolvedValue({ ok: false, error: "provider" });
    await expect(syncConversionSource({ projectId, source: "plausible" })).resolves.toEqual({
      error: "failed",
      ok: false,
    });
    expect(mocks.recordAppAction).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });
});
