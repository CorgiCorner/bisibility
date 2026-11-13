import { Prisma } from "@/lib/generated/prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { takePageSnapshotAction } from "./page-snapshot";

const mocks = vi.hoisted(() => ({
  actor: { id: "user_1" },
  emit: vi.fn(),
  prisma: {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    pageSnapshot: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    pageSnapshotPage: { createMany: vi.fn() },
    projectPage: { findMany: vi.fn() },
    projectPageSource: { findFirst: vi.fn() },
  },
  record: vi.fn(),
  requireScope: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/activity/app-mutation", () => ({ recordAppAction: mocks.record }));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.writeAudit,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/signals/emit", () => ({ emitSignal: mocks.emit }));
vi.mock("./_shared", () => ({
  getActionActor: vi.fn(async () => mocks.actor),
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
  requireProjectScope: mocks.requireScope,
}));

const takenOn = new Date("2026-10-01T00:00:00.000Z");

describe("takePageSnapshotAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.prisma) => unknown) =>
      fn(mocks.prisma),
    );
    mocks.requireScope.mockResolvedValue({ id: "project_1", publicId: "prj_1" });
    mocks.prisma.pageSnapshot.findFirst.mockResolvedValue(null);
    mocks.prisma.projectPageSource.findFirst.mockResolvedValue({ id: "source_1" });
    mocks.prisma.$queryRaw.mockResolvedValue([{ id: "page_1" }, { id: "page_2" }]);
    mocks.emit.mockResolvedValue({ id: "signal_1", publicId: "sig_storysnapshot000000000" });
    mocks.prisma.pageSnapshot.create.mockResolvedValue({
      id: "snapshot_1",
      label: "Day 1",
      pageCount: 2,
      source: "sitemap",
      takenOn,
    });
  });

  it("stores the listed sitemap pages and one manual note", async () => {
    const result = await takePageSnapshotAction({ projectId: "prj_1" });
    expect(result).toMatchObject({
      replaced: false,
      snapshot: { pageCount: 2, source: "sitemap", takenOn: "2026-10-01" },
      status: "taken",
    });
    expect(mocks.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { note: "Day 1 snapshot: 2 pages" },
        source: "manual",
        type: "note",
      }),
      mocks.prisma,
    );
    expect(mocks.prisma.pageSnapshotPage.createMany).toHaveBeenCalledWith({
      data: [
        { pageId: "page_1", snapshotId: "snapshot_1" },
        { pageId: "page_2", snapshotId: "snapshot_1" },
      ],
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "page_snapshot.take",
        targetId: "prj_1",
        targetType: "project",
      }),
    );
    expect(mocks.requireScope).toHaveBeenCalledWith(mocks.actor, "create", "prj_1", {
      type: "keyword",
    });
  });

  it("asks before replacing an active snapshot and archives it only after confirmation", async () => {
    mocks.prisma.pageSnapshot.findFirst.mockResolvedValue({ pageCount: 4, takenOn });
    const pending = await takePageSnapshotAction({ projectId: "prj_1" });
    expect(pending).toEqual({ pageCount: 4, status: "needs_confirmation", takenOn: "2026-10-01" });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();

    const replaced = await takePageSnapshotAction({ confirm: true, projectId: "prj_1" });
    expect(replaced).toMatchObject({ replaced: true, status: "taken" });
    expect(mocks.prisma.pageSnapshot.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { archivedAt: expect.any(Date) },
        where: { archivedAt: null, projectId: "project_1" },
      }),
    );
  });

  it("records a registry source when the project has no sitemap rows", async () => {
    mocks.prisma.projectPageSource.findFirst.mockResolvedValue(null);
    mocks.prisma.projectPage.findMany.mockResolvedValue([{ id: "page_1" }]);
    mocks.prisma.pageSnapshot.create.mockResolvedValue({
      id: "snapshot_1",
      label: "Day 1",
      pageCount: 1,
      source: "registry",
      takenOn,
    });
    const result = await takePageSnapshotAction({ projectId: "prj_1" });
    expect(result).toMatchObject({ snapshot: { source: "registry" }, status: "taken" });
    expect(mocks.prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("returns a conflict when another active snapshot wins the race", async () => {
    mocks.prisma.pageSnapshot.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        clientVersion: "7.9.1",
        code: "P2002",
      }),
    );
    await expect(takePageSnapshotAction({ projectId: "prj_1" })).resolves.toEqual({
      status: "conflict",
    });
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });
});
