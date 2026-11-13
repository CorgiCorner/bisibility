import { AuthorizationError } from "@/lib/auth/authorize";
import { ProjectReadOnlyError } from "@/lib/deployment/project-write-mode";
import { beforeEach, describe, expect, it, vi } from "vitest";

const projectId = "prj_aaaaaaaaaaaaaaaaaaaaaaaa";
const db = vi.hoisted(() => ({
  aiProjectEngine: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
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
vi.mock("@/lib/api/ai-tracking-service", () => ({ trackingScope: mocks.scope }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("@/lib/activity/app-mutation", () => ({ recordAppAction: mocks.activity }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("./_shared", () => ({
  getActionActor: mocks.actor,
  parseActionInput: (schema: { parse: (value: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
}));

import { setAiProjectEngine } from "./ai-project-engines";

const actor = { email: "owner@example.com", id: "user_1", memberships: [], role: "owner" };

describe("setAiProjectEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue(actor);
    mocks.scope.mockResolvedValue({ id: "project_db", publicId: projectId, writeMode: "active" });
    mocks.audit.mockResolvedValue({});
    db.aiProjectEngine.findUnique.mockResolvedValue(null);
    db.aiProjectEngine.upsert.mockResolvedValue({
      enabled: true,
      engine: "gemini",
      source: "consumer_scrape",
    });
  });

  it("enables a runnable engine and audits the change", async () => {
    await expect(
      setAiProjectEngine({
        enabled: true,
        engine: "gemini",
        projectId,
        source: "consumer_scrape",
      }),
    ).resolves.toEqual({ ok: true });
    expect(mocks.scope).toHaveBeenCalledWith(actor, projectId, true);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ai_tracking.engine.enable",
        actorId: "user_1",
        projectId: "project_db",
        targetType: "ai_project_engine",
      }),
      db,
    );
    expect(mocks.activity).toHaveBeenCalledWith(actor);
  });

  it("disables an engine with the matching audit label", async () => {
    db.aiProjectEngine.findUnique.mockResolvedValue({
      enabled: true,
      engine: "chat_gpt",
      source: "consumer_scrape",
    });
    db.aiProjectEngine.upsert.mockResolvedValue({
      enabled: false,
      engine: "chat_gpt",
      source: "consumer_scrape",
    });
    await setAiProjectEngine({
      enabled: false,
      engine: "chat_gpt",
      projectId,
      source: "consumer_scrape",
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ai_tracking.engine.disable" }),
      db,
    );
  });

  it("does not write when the stored choice is already the requested one", async () => {
    db.aiProjectEngine.findUnique.mockResolvedValue({
      enabled: true,
      engine: "gemini",
      source: "consumer_scrape",
    });
    await setAiProjectEngine({
      enabled: true,
      engine: "gemini",
      projectId,
      source: "consumer_scrape",
    });
    expect(db.aiProjectEngine.upsert).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.activity).not.toHaveBeenCalled();
  });

  it("refuses an engine tracking cannot run", async () => {
    await expect(
      setAiProjectEngine({
        enabled: true,
        engine: "perplexity",
        projectId,
        source: "consumer_scrape",
      }),
    ).resolves.toEqual({ error: "unavailable", ok: false });
    await expect(
      setAiProjectEngine({
        enabled: true,
        engine: "claude",
        projectId,
        source: "model_api",
      }),
    ).resolves.toEqual({ error: "unavailable", ok: false });
    expect(mocks.scope).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("lets the schedule write scope reject read-only and forbidden actors", async () => {
    mocks.scope.mockRejectedValueOnce(new ProjectReadOnlyError("project_db"));
    await expect(
      setAiProjectEngine({
        enabled: true,
        engine: "gemini",
        projectId,
        source: "consumer_scrape",
      }),
    ).rejects.toBeInstanceOf(ProjectReadOnlyError);
    mocks.scope.mockRejectedValueOnce(new AuthorizationError("forbidden"));
    await expect(
      setAiProjectEngine({
        enabled: false,
        engine: "gemini",
        projectId,
        source: "consumer_scrape",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(db.aiProjectEngine.upsert).not.toHaveBeenCalled();
  });
});
