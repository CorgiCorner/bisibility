import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyProjectContext } from "./model";
import { getProjectContext, saveProjectContext } from "./service";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), upsert: vi.fn(), project: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    projectContext: { findUnique: mocks.findUnique, upsert: mocks.upsert },
    project: { findUniqueOrThrow: mocks.project },
  },
}));

const input = {
  business: "Business",
  audience: "Teams",
  products: "Tools",
  goals: "Growth",
  agentRules: "No credentials",
};

describe("project context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(null);
    mocks.project.mockResolvedValue({ id: "project1", writeMode: "active" });
    mocks.upsert.mockResolvedValue({
      ...input,
      projectId: "project1",
      updatedAt: new Date("2026-10-02T12:00:00Z"),
    });
  });
  it("returns empty context or the saved fields without internal IDs", async () => {
    expect(await getProjectContext("project1")).toEqual(emptyProjectContext);
    mocks.findUnique.mockResolvedValue({
      ...input,
      projectId: "project1",
      updatedAt: new Date("2026-10-02T12:00:00Z"),
    });
    expect(await getProjectContext("project1")).toEqual({
      ...input,
      updatedAt: "2026-10-02T12:00:00.000Z",
    });
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { projectId: "project1" } });
  });
  it("validates fields before reading or writing storage", async () => {
    await expect(
      saveProjectContext("project1", { ...input, agentRules: "x".repeat(4001) }),
    ).rejects.toThrow();
    expect(mocks.project).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("upserts one project context and respects project write mode", async () => {
    await saveProjectContext("project1", input);
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { projectId: "project1" },
      create: { ...input, projectId: "project1" },
      update: input,
    });
    mocks.project.mockResolvedValue({ writeMode: "migrated" });
    mocks.upsert.mockClear();
    await expect(saveProjectContext("project1", input)).rejects.toThrow("read-only");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
