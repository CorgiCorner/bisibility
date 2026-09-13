import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), dto: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { rankCheckRun: { findMany: mocks.findMany } } }));
vi.mock("./rank-check-run-dto", () => ({ rankCheckRunDto: mocks.dto, rankCheckRunSelect: {} }));

import { scheduleRunHistory } from "./schedule-run-history";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dto.mockImplementation((row) => row);
});
it("paginates only this project's schedule history, retaining the link after archival", async () => {
  const createdAt = new Date("2026-09-08T17:00:00.000Z");
  mocks.findMany.mockResolvedValue(
    Array.from({ length: 51 }, (_, index) => ({
      publicId: `rcr_${String(index).padStart(24, "a")}`,
      createdAt,
    })),
  );
  const page = await scheduleRunHistory("project", "sch_archived");
  expect(page.data).toHaveLength(50);
  expect(page.nextCursor).toEqual(expect.any(String));
  mocks.findMany.mockResolvedValue([]);
  await scheduleRunHistory("project", "sch_archived", page.nextCursor ?? undefined);
  expect(mocks.findMany).toHaveBeenLastCalledWith(
    expect.objectContaining({
      where: {
        projectId: "project",
        deletedAt: null,
        checkSchedule: { publicId: "sch_archived" },
        AND: expect.arrayContaining([
          expect.objectContaining({
            OR: expect.arrayContaining([{ createdAt: { lt: createdAt } }]),
          }),
        ]),
      },
      orderBy: [{ createdAt: "desc" }, { publicId: "desc" }],
      take: 51,
    }),
  );
});

it("excludes deleted runs from archived schedule history before pagination", async () => {
  mocks.findMany.mockResolvedValue([]);
  await scheduleRunHistory("project", "sch_archived");
  expect(mocks.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        projectId: "project",
        deletedAt: null,
        checkSchedule: { publicId: "sch_archived" },
      }),
    }),
  );
});
