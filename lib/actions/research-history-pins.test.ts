import { beforeEach, describe, expect, it, vi } from "vitest";
import { pinResearchHistoryAction, unpinResearchHistoryAction } from "./research-history-pins";

const projectRef = "prj_abcdefghijklmnopqrstuvwx";
const mocks = vi.hoisted(() => ({
  actor: { id: "user_1" },
  getActionActor: vi.fn(),
  recordAppAction: vi.fn(),
  requireProjectScope: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: mocks.getActionActor,
  requireProjectScope: mocks.requireProjectScope,
}));
vi.mock("@/lib/activity/app-mutation", () => ({ recordAppAction: mocks.recordAppAction }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    researchHistoryPin: { deleteMany: mocks.deleteMany, upsert: mocks.upsert },
  },
}));

const input = {
  itemKey: "agr_example",
  projectRef,
  surface: "model_playground",
};

describe("research history pins", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActionActor.mockResolvedValue(mocks.actor);
    mocks.requireProjectScope.mockResolvedValue({ id: "project_1" });
  });

  it("pins a personal history row without an audit write", async () => {
    await expect(pinResearchHistoryAction(input)).resolves.toEqual({ ok: true });
    expect(mocks.requireProjectScope).toHaveBeenCalledWith(
      mocks.actor,
      "update",
      projectRef,
      { type: "project_surface_preference" },
      { allowReadOnly: true },
    );
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: {
          itemKey: "agr_example",
          projectId: "project_1",
          surface: "model_playground",
          userId: "user_1",
        },
      }),
    );
    expect(mocks.recordAppAction).toHaveBeenCalledWith(mocks.actor);
  });

  it("removes only that user's pin", async () => {
    await expect(unpinResearchHistoryAction(input)).resolves.toEqual({ ok: true });
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: {
        itemKey: "agr_example",
        projectId: "project_1",
        surface: "model_playground",
        userId: "user_1",
      },
    });
  });

  it("rejects a project the actor cannot update", async () => {
    mocks.requireProjectScope.mockRejectedValue(new Error("denied"));
    await expect(pinResearchHistoryAction(input)).resolves.toEqual({ ok: false });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.recordAppAction).not.toHaveBeenCalled();
  });
});
