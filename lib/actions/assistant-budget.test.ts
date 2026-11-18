import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  scope: vi.fn(),
  set: vi.fn(),
  revalidate: vi.fn(),
  record: vi.fn(),
}));

vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: mocks.actor,
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
  requireProjectScope: mocks.scope,
  revalidateBudgetViews: mocks.revalidate,
}));
vi.mock("@/lib/activity/app-mutation", () => ({ recordAppAction: mocks.record }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: (body: (tx: object) => unknown) => body({}) },
}));
vi.mock("@/lib/assistant/funding-extension", () => ({
  setAssistantProjectLimit: mocks.set,
}));

import { updateAssistantProjectLimitAction } from "./assistant-budget";

describe("updateAssistantProjectLimitAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue({ id: "user_1" });
    mocks.scope.mockResolvedValue({ id: "project_1", publicId: "prj_example" });
    mocks.set.mockResolvedValue({ capCents: 250 });
  });

  it("requires manage permission and records the AI cap", async () => {
    await expect(
      updateAssistantProjectLimitAction({ projectId: "prj_example", capCents: 250 }),
    ).resolves.toEqual({ capCents: 250 });
    expect(mocks.scope).toHaveBeenCalledWith({ id: "user_1" }, "manage", "prj_example", {
      type: "project",
    });
    expect(mocks.set).toHaveBeenCalledWith(
      {},
      {
        actor: { id: "user_1" },
        projectId: "project_1",
        projectPublicId: "prj_example",
        capCents: 250,
      },
    );
    expect(mocks.record).toHaveBeenCalledWith({ id: "user_1" });
  });

  it("rejects a member and an invalid cap before writing", async () => {
    mocks.scope.mockRejectedValue(new Error("forbidden"));
    await expect(
      updateAssistantProjectLimitAction({ projectId: "prj_example", capCents: 250 }),
    ).rejects.toThrow("forbidden");
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
    mocks.scope.mockResolvedValue({ id: "project_1", publicId: "prj_example" });
    await expect(
      updateAssistantProjectLimitAction({ projectId: "prj_example", capCents: 1.5 }),
    ).rejects.toThrow();
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
