import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { beginJob, canTransition, jobView, transitions } from "./jobs";

const mocks = vi.hoisted(() => ({
  prisma: {
    cloudImportJob: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const token = {
  id: "token_1",
  projectId: "project_1",
  projectPublicId: "prj_abcdefghijklmnopqrstuvwx",
  publicId: "ferry_abcdefghijklmnopqrstuvwx",
};

function job(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: new Date("2026-07-08T18:50:00.000Z"),
    id: "job_1",
    progress: 0,
    publicId: "imp_a00000000000000000000000",
    state: "idle",
    tokenId: "token_1",
    ...overrides,
  };
}

describe("instance import jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-08T19:30:00.000Z"));
    mocks.prisma.cloudImportJob.create.mockImplementation(({ data }) =>
      Promise.resolve(job({ ...data, id: "job_created" })),
    );
    mocks.prisma.cloudImportJob.update.mockImplementation(({ data, where }) =>
      Promise.resolve(job({ ...data, id: where.id })),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("exposes the legal import state transitions", () => {
    expect(transitions).toMatchObject({
      done: [],
      failed: [],
      idle: ["receiving", "failed"],
      importing: ["done", "failed"],
      receiving: ["importing", "failed"],
    });
    expect(canTransition("idle", "receiving")).toBe(true);
    expect(canTransition("receiving", "done")).toBe(false);
  });

  it("reclaims an idle token job", async () => {
    mocks.prisma.cloudImportJob.findFirst.mockResolvedValue(job());

    await expect(beginJob(token)).resolves.toMatchObject({
      id: "job_1",
      progress: 1,
      state: "receiving",
    });
    expect(mocks.prisma.cloudImportJob.findFirst).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      where: {
        OR: [
          { state: "idle" },
          { state: "receiving", updatedAt: { lt: new Date("2026-07-08T19:00:00.000Z") } },
        ],
        projectId: "project_1",
        tokenId: "token_1",
      },
    });
    expect(mocks.prisma.cloudImportJob.update).toHaveBeenCalledWith({
      data: {
        progress: 1,
        startedAt: new Date("2026-07-08T19:30:00.000Z"),
        state: "receiving",
      },
      where: { id: "job_1" },
    });
  });

  it("creates a receiving job when no reclaimable job exists", async () => {
    mocks.prisma.cloudImportJob.findFirst.mockResolvedValue(null);

    await expect(beginJob(token)).resolves.toMatchObject({
      id: "job_created",
      state: "receiving",
    });
    expect(mocks.prisma.cloudImportJob.create).toHaveBeenCalledWith({
      data: {
        progress: 1,
        projectId: "project_1",
        publicId: expect.stringMatching(/^imp_[a-z][a-z0-9]{23}$/),
        startedAt: new Date("2026-07-08T19:30:00.000Z"),
        state: "receiving",
        tokenId: "token_1",
      },
    });
  });

  it("serializes only the job public ID and fails closed for legacy rows", () => {
    expect(jobView(job() as never).id).toBe("imp_a00000000000000000000000");
    expect(() => jobView(job({ publicId: null }) as never)).toThrow(
      "Expected a v3 public resource ID",
    );
  });
});
