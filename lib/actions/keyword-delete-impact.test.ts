import { beforeEach, describe, expect, it, vi } from "vitest";
import { previewKeywordDeletion } from "./keyword-delete-impact";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), requireScope: vi.fn(), getActor: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { keyword: { findMany: mocks.findMany } } }));
vi.mock("./_shared", () => ({
  parseActionInput: (schema: { parse: (value: unknown) => unknown }, value: unknown) =>
    schema.parse(value),
  getActionActor: mocks.getActor,
  requireProjectScope: mocks.requireScope,
}));
const projectId = "prj_abcdefghijklmnopqrstuvwx";
const keywordIds = ["kw_abcdefghijklmnopqrstuvwx", "kw_bcdefghijklmnopqrstuvwxy"];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getActor.mockResolvedValue({ id: "actor" });
  mocks.requireScope.mockResolvedValue({ id: "project_internal" });
});
describe("keyword deletion impact", () => {
  it("counts all assigned members beyond the page and distinguishes keywords from targets", async () => {
    const schedule = { publicId: "sch_a", name: "Daily", _count: { keywords: 8 } };
    mocks.findMany.mockResolvedValue([
      { rankCheckRunItems: [], text: "keyword", checkSchedule: schedule },
      { rankCheckRunItems: [], text: "keyword", checkSchedule: schedule },
    ]);
    expect(await previewKeywordDeletion({ projectId, keywordIds })).toEqual({
      keywordCount: 1,
      targetCount: 2,
      runningTargetCount: 0,
      schedules: [{ publicId: "sch_a", name: "Daily", removedTargets: 2, remainingTargets: 6 }],
    });
    expect(mocks.requireScope).toHaveBeenCalledWith({ id: "actor" }, "delete", projectId, {
      type: "keyword",
    });
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: "project_internal", publicId: { in: keywordIds } },
      }),
    );
  });
  it("identifies the final member and excludes manual targets from the schedule count", async () => {
    mocks.findMany.mockResolvedValue([
      {
        rankCheckRunItems: [],
        text: "one",
        checkSchedule: { publicId: "sch_a", name: "Daily", _count: { keywords: 1 } },
      },
      { rankCheckRunItems: [], text: "two", checkSchedule: null },
    ]);
    expect(await previewKeywordDeletion({ projectId, keywordIds })).toMatchObject({
      keywordCount: 2,
      targetCount: 2,
      runningTargetCount: 0,
      schedules: [{ removedTargets: 1, remainingTargets: 0 }],
    });
  });
  it("reports targets protected by an in-flight provider check", async () => {
    mocks.findMany.mockResolvedValue([
      { text: "one", checkSchedule: null, rankCheckRunItems: [{ id: "item" }] },
    ]);
    expect(await previewKeywordDeletion({ projectId, keywordIds })).toMatchObject({
      runningTargetCount: 1,
    });
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          rankCheckRunItems: expect.objectContaining({
            where: {
              rankCheckId: { not: null },
              status: "running",
              run: { status: { in: ["queued", "running", "cancelling"] } },
            },
          }),
        }),
      }),
    );
  });

  it("reports active snapshot extensions as in-flight work", async () => {
    mocks.findMany.mockResolvedValue([
      { text: "one", checkSchedule: null, rankCheckRunItems: [], rankChecks: [{ id: "check" }] },
    ]);
    expect(await previewKeywordDeletion({ projectId, keywordIds })).toMatchObject({
      runningTargetCount: 1,
    });
  });

  it("returns no unrelated schedules when the selection no longer exists", async () => {
    mocks.findMany.mockResolvedValue([]);
    expect(await previewKeywordDeletion({ projectId, keywordIds })).toEqual({
      keywordCount: 0,
      targetCount: 0,
      runningTargetCount: 0,
      schedules: [],
    });
  });
  it("does not read members if deletion is unauthorized", async () => {
    mocks.requireScope.mockRejectedValueOnce(new Error("forbidden"));
    await expect(previewKeywordDeletion({ projectId, keywordIds })).rejects.toThrow("forbidden");
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
