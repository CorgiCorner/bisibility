import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCloudImportJobStatus,
  getCloudImportView,
  idleCloudImportJob,
  isNonterminalCloudImportJob,
} from "./cloud";

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    cloudImportJob: { findFirst: vi.fn(), updateManyAndReturn: vi.fn() },
    migrationToken: { findFirst: vi.fn() },
  },
  requireReadableProject: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));

describe("cloud queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-28T12:00:00.000Z"));
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
    mocks.requireReadableProject.mockResolvedValue({
      project: {
        domain: "acme.example.com",
        id: "project_1",
        name: "Acme",
        ownerId: "user_1",
        publicId: "prj_abcdefghijklmnopqrstuvwx",
        writeMode: "active",
      },
    });
    mocks.prisma.cloudImportJob.updateManyAndReturn.mockResolvedValue([]);
  });

  it("reads the active token and latest import job for the workspace", async () => {
    mocks.prisma.migrationToken.findFirst.mockResolvedValue({
      createdAt: new Date("2026-06-28T12:00:00.000Z"),
      createdBy: { email: "owner@example.com", name: "Owner" },
      expiresAt: new Date("2026-06-28T13:00:00.000Z"),
      id: "token_1",
      publicId: "ferry_abcdefghijklmnopqrstuvwx",
      scope: "full",
      singleUse: true,
    });
    mocks.prisma.cloudImportJob.findFirst.mockResolvedValue({
      counts: { keywords: 12 },
      createdAt: new Date("2026-06-28T12:01:00.000Z"),
      error: null,
      finishedAt: null,
      id: "job_1",
      publicId: "imp_abcdefghijklmnopqrstuvwx",
      progress: 76,
      startedAt: new Date("2026-06-28T12:02:00.000Z"),
      state: "importing",
    });

    const view = await getCloudImportView("prj_1");

    expect(mocks.prisma.migrationToken.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          consumedAt: null,
          expiresAt: { gt: new Date("2026-06-28T12:00:00.000Z") },
          projectId: "project_1",
        },
      }),
    );
    expect(view.activeToken).toMatchObject({
      createdBy: { email: "owner@example.com", name: "Owner" },
      id: "ferry_abcdefghijklmnopqrstuvwx",
      scope: "full",
    });
    expect(view.importJob).toMatchObject({
      id: "imp_abcdefghijklmnopqrstuvwx",
      progress: 76,
      state: "importing",
    });
    expect(view.project.id).toBe("prj_abcdefghijklmnopqrstuvwx");
    expect(view.project.writeMode).toBe("active");
  });

  it("returns an idle job fallback when no transfer exists", async () => {
    mocks.prisma.migrationToken.findFirst.mockResolvedValue(null);
    mocks.prisma.cloudImportJob.findFirst.mockResolvedValue(null);

    const view = await getCloudImportView("prj_1");

    expect(view.activeToken).toBeNull();
    expect(view.importJob).toEqual({
      counts: null,
      createdAt: null,
      error: null,
      finishedAt: null,
      id: null,
      progress: 0,
      startedAt: null,
      state: "idle",
    });
  });

  it.each(["done", "failed"] as const)(
    "does not restore a historical %s job as the current transfer",
    async (state) => {
      mocks.prisma.migrationToken.findFirst.mockResolvedValue(null);
      mocks.prisma.cloudImportJob.findFirst.mockImplementation(({ where }) => {
        if ("OR" in where) return null;
        return {
          counts: { keywords: 1 },
          createdAt: new Date("2026-06-20T12:01:00.000Z"),
          error: null,
          finishedAt: new Date("2026-06-20T12:05:00.000Z"),
          id: "job_done",
          publicId: "job_bbcdefghijklmnopqrstuvwx",
          progress: 100,
          startedAt: new Date("2026-06-20T12:02:00.000Z"),
          state,
        };
      });

      const view = await getCloudImportView("prj_1");

      expect(view.importJob).toEqual(idleCloudImportJob());
      expect(mocks.prisma.cloudImportJob.findFirst).toHaveBeenCalledWith({
        orderBy: { createdAt: "desc" },
        where: {
          OR: [
            { state: { in: ["receiving", "importing"] } },
            {
              state: "idle",
              token: {
                is: {
                  consumedAt: null,
                  expiresAt: { gt: new Date("2026-06-28T12:00:00.000Z") },
                },
              },
            },
          ],
          projectId: "project_1",
        },
      });
    },
  );

  it("reads only the latest import job for polling", async () => {
    mocks.prisma.cloudImportJob.findFirst.mockResolvedValue({
      counts: { history: 3, keywords: 2 },
      createdAt: new Date("2026-06-28T12:01:00.000Z"),
      error: null,
      finishedAt: new Date("2026-06-28T12:05:00.000Z"),
      id: "job_done",
      publicId: "imp_bbcdefghijklmnopqrstuvwx",
      progress: 100,
      startedAt: new Date("2026-06-28T12:02:00.000Z"),
      state: "done",
    });

    const job = await getCloudImportJobStatus("prj_1");

    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_1");
    expect(mocks.prisma.cloudImportJob.findFirst).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      where: { projectId: "project_1" },
    });
    expect(job).toEqual({
      counts: { history: 3, keywords: 2 },
      createdAt: "2026-06-28T12:01:00.000Z",
      error: null,
      finishedAt: "2026-06-28T12:05:00.000Z",
      id: "imp_bbcdefghijklmnopqrstuvwx",
      progress: 100,
      startedAt: "2026-06-28T12:02:00.000Z",
      state: "done",
    });
  });

  it("does not fall back to raw database job ids", async () => {
    mocks.prisma.cloudImportJob.findFirst.mockResolvedValue({
      counts: null,
      createdAt: new Date("2026-06-28T12:01:00.000Z"),
      error: null,
      finishedAt: null,
      id: "job_raw",
      progress: 1,
      publicId: null,
      startedAt: null,
      state: "receiving",
    });

    await expect(getCloudImportJobStatus("prj_1")).rejects.toThrow(
      "Expected a strict imp_ v3 public ID.",
    );
  });
});

describe("isNonterminalCloudImportJob", () => {
  it("distinguishes real resumable jobs from the empty placeholder and terminal jobs", () => {
    const placeholder = idleCloudImportJob();
    expect(isNonterminalCloudImportJob(placeholder)).toBe(false);
    expect(isNonterminalCloudImportJob({ ...placeholder, id: "job_idle" })).toBe(true);
    expect(
      isNonterminalCloudImportJob({ ...placeholder, id: "job_receiving", state: "receiving" }),
    ).toBe(true);
    expect(isNonterminalCloudImportJob({ ...placeholder, id: "job_done", state: "done" })).toBe(
      false,
    );
    expect(isNonterminalCloudImportJob({ ...placeholder, id: "job_failed", state: "failed" })).toBe(
      false,
    );
  });
});
