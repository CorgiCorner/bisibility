import { beforeEach, describe, expect, it, vi } from "vitest";

const projectId = "prj_aaaaaaaaaaaaaaaaaaaaaaaa";
const db = vi.hoisted(() => ({
  aiSourcePlanItem: {
    delete: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  },
  aiSourceTypeOverride: { delete: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
  aiTopic: { findMany: vi.fn() },
  aiTrackingSample: { findFirst: vi.fn(), findMany: vi.fn() },
  competitor: { findMany: vi.fn() },
  project: { findUnique: vi.fn() },
}));
const mocks = vi.hoisted(() => ({
  activity: vi.fn(),
  actor: vi.fn(),
  audit: vi.fn(),
  revalidate: vi.fn(),
  scope: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: typeof db) => Promise<unknown>) => fn(db),
    ...db,
  },
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("@/lib/activity/app-mutation", () => ({ recordAppAction: mocks.activity }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("./_shared", () => ({
  getActionActor: mocks.actor,
  parseActionInput: (schema: { parse: (value: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
  requireProjectScope: mocks.scope,
}));

import {
  addAiSourcePlanItem,
  clearAiSourceType,
  removeAiSourcePlanItem,
  setAiSourceType,
  updateAiSourcePlanItem,
} from "./ai-sources";

const actor = { email: "owner@example.com", id: "user_1", memberships: [], role: "owner" };

describe("AI source actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue(actor);
    mocks.scope.mockResolvedValue({ id: "project_db", publicId: projectId, writeMode: "active" });
    mocks.audit.mockResolvedValue({});
    db.project.findUnique.mockResolvedValue({
      brandExcludedNames: ["Acme Tools"],
      domain: "example.com",
    });
    db.competitor.findMany.mockResolvedValue([]);
    db.aiSourceTypeOverride.findUnique.mockResolvedValue(null);
    db.aiSourcePlanItem.findUnique.mockResolvedValue(null);
  });

  it("stores a type override and refuses fixed domains", async () => {
    db.aiSourceTypeOverride.upsert.mockResolvedValue({
      domain: "example.org",
      type: "directory",
    });
    await expect(
      setAiSourceType({
        domain: "https://www.directory.example.org/list",
        projectId,
        type: "directory",
      }),
    ).resolves.toEqual({ ok: true });
    expect(db.aiSourceTypeOverride.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ domain: "example.org", type: "directory" }),
      }),
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ai_source.type.set",
        targetId: "example.org",
        targetType: "ai_source",
      }),
      db,
    );
    mocks.audit.mockClear();
    await expect(
      setAiSourceType({ domain: "blog.example.com", projectId, type: "reviews" }),
    ).resolves.toEqual({ ok: false, error: "fixed" });
    db.project.findUnique.mockResolvedValue({
      brandExcludedNames: ["lookalike.example.org"],
      domain: "example.com",
    });
    await expect(
      setAiSourceType({ domain: "lookalike.example.org", projectId, type: "community" }),
    ).resolves.toEqual({ ok: false, error: "fixed" });
    db.project.findUnique.mockResolvedValue({
      brandExcludedNames: ["Acme Tools"],
      domain: "example.com",
    });
    db.competitor.findMany.mockResolvedValue([{ domain: "north.example.org" }]);
    await expect(
      setAiSourceType({ domain: "shop.north.example.org", projectId, type: "editorial" }),
    ).resolves.toEqual({ ok: false, error: "fixed" });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("clears an override only when one is stored", async () => {
    await expect(clearAiSourceType({ domain: "notes.example.org", projectId })).resolves.toEqual({
      ok: true,
    });
    expect(mocks.audit).not.toHaveBeenCalled();
    db.aiSourceTypeOverride.findUnique.mockResolvedValue({
      domain: "example.org",
      type: "other",
    });
    await clearAiSourceType({ domain: "notes.example.org", projectId });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ai_source.type.clear" }),
      db,
    );
  });

  it("adds, updates and removes a plan item", async () => {
    db.aiSourcePlanItem.upsert.mockResolvedValue({
      domain: "example.org",
      note: null,
      state: "todo",
      url: "https://directory.example.org/list",
    });
    await expect(
      addAiSourcePlanItem({
        domain: "directory.example.org",
        projectId,
        url: "https://directory.example.org/list",
      }),
    ).resolves.toEqual({ ok: true });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ai_source.plan.add" }),
      db,
    );
    await expect(addAiSourcePlanItem({ domain: "example.com", projectId })).resolves.toEqual({
      ok: false,
      error: "fixed",
    });
    await expect(
      addAiSourcePlanItem({
        domain: "directory.example.org",
        projectId,
        url: "https://other.example.com/page",
      }),
    ).resolves.toEqual({ ok: false, error: "url" });

    await expect(
      updateAiSourcePlanItem({ domain: "missing.example.org", projectId, state: "done" }),
    ).resolves.toEqual({ ok: false, error: "missing" });
    db.aiSourcePlanItem.findUnique.mockResolvedValue({
      domain: "directory.example.org",
      note: null,
      state: "todo",
      url: null,
    });
    db.aiSourcePlanItem.update.mockResolvedValue({
      domain: "directory.example.org",
      note: "Ask",
      state: "done",
      url: null,
    });
    await updateAiSourcePlanItem({
      domain: "directory.example.org",
      note: "Ask",
      projectId,
      state: "done",
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ai_source.plan.update" }),
      db,
    );
    await removeAiSourcePlanItem({ domain: "directory.example.org", projectId });
    expect(db.aiSourcePlanItem.delete).toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ai_source.plan.remove" }),
      db,
    );
  });
});
