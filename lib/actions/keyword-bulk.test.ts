import { beforeEach, describe, expect, it, vi } from "vitest";
import { bulkClearTargetUrls, bulkDeleteKeywords, bulkSetTargetUrl } from "./keyword-bulk";

const KEYWORD_PUBLIC_ID = "kw_abcdefghijklmnopqrstuvwx";
const PROJECT_PUBLIC_ID = "prj_abcdefghijklmnopqrstuvwx";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    keyword: { deleteMany: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    project: { findFirst: vi.fn() },
    rankCheckRun: { update: vi.fn() },
    rankCheckRunItem: { findMany: vi.fn(), updateMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
  requireSession: vi.fn(),
  revalidatePath: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/auth/authorize", () => ({ authorize: mocks.authorize }));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.writeAudit,
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

describe("bulk target URL actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.prisma.user.findUnique.mockResolvedValue({
      memberships: [{ projectId: "project_1", role: "admin" }],
      role: "admin",
    });
    mocks.prisma.project.findFirst.mockResolvedValue({
      id: "project_1",
      ownerId: "user_1",
      publicId: PROJECT_PUBLIC_ID,
      writeMode: "read_write",
      writeModeChangedAt: null,
      writeModeChangedById: null,
    });
    mocks.prisma.keyword.findMany.mockResolvedValue([
      {
        id: "keyword_1",
        publicId: KEYWORD_PUBLIC_ID,
        targetUrl: "/old",
      },
    ]);
    mocks.prisma.keyword.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.rankCheckRun.update.mockResolvedValue({});
    mocks.prisma.rankCheckRunItem.findMany.mockResolvedValue([]);
    mocks.prisma.rankCheckRunItem.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mocks.prisma) => unknown) => callback(mocks.prisma),
    );
  });

  it("sets one explicit URL for the selected keywords", async () => {
    await expect(
      bulkSetTargetUrl({
        keywordIds: [KEYWORD_PUBLIC_ID],
        projectId: PROJECT_PUBLIC_ID,
        targetUrl: "/features/rank-tracking",
      }),
    ).resolves.toEqual({ updated: 1 });

    expect(mocks.prisma.keyword.updateMany).toHaveBeenCalledWith({
      data: { targetUrl: "/features/rank-tracking" },
      where: { id: { in: ["keyword_1"] } },
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "keyword.bulk_set_target",
        before: [{ id: KEYWORD_PUBLIC_ID, targetUrl: "/old" }],
      }),
    );
  });

  it("rejects a blank bulk value instead of silently clearing targets", async () => {
    await expect(
      bulkSetTargetUrl({
        keywordIds: [KEYWORD_PUBLIC_ID],
        projectId: PROJECT_PUBLIC_ID,
        targetUrl: "",
      }),
    ).rejects.toThrow("Enter a target URL.");

    expect(mocks.prisma.keyword.updateMany).not.toHaveBeenCalled();
  });

  it("clears targets only through the explicit clear action", async () => {
    await expect(
      bulkClearTargetUrls({ keywordIds: [KEYWORD_PUBLIC_ID], projectId: PROJECT_PUBLIC_ID }),
    ).resolves.toEqual({ updated: 1 });

    expect(mocks.prisma.keyword.updateMany).toHaveBeenCalledWith({
      data: { targetUrl: null },
      where: { id: { in: ["keyword_1"] } },
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "keyword.bulk_clear_target",
        before: [{ id: KEYWORD_PUBLIC_ID, targetUrl: "/old" }],
      }),
    );
  });

  it("deletes by internal IDs while auditing only strict keyword public IDs", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValueOnce([
      { id: "keyword_1", publicId: KEYWORD_PUBLIC_ID, text: "rank tracker" },
    ]);
    mocks.prisma.keyword.deleteMany.mockResolvedValueOnce({ count: 1 });

    await expect(
      bulkDeleteKeywords({
        keywordIds: [KEYWORD_PUBLIC_ID],
        projectId: PROJECT_PUBLIC_ID,
      }),
    ).resolves.toEqual({ deleted: 1 });

    expect(mocks.prisma.keyword.updateMany).not.toHaveBeenCalled();
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "keyword.bulk_delete",
        before: [{ id: KEYWORD_PUBLIC_ID, text: "rank tracker" }],
      }),
    );
    expect(JSON.stringify(mocks.writeAudit.mock.calls[0]?.[0])).not.toContain("keyword_1");
  });

  it("cancels a queued active-run item before deleting its keyword", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValueOnce([
      { id: "keyword_1", publicId: KEYWORD_PUBLIC_ID, text: "rank tracker" },
    ]);
    mocks.prisma.rankCheckRunItem.findMany.mockResolvedValueOnce([
      {
        id: "item_1",
        keywordId: "keyword_1",
        rankCheckId: null,
        run: { publicId: "rcr_abcdefghijklmnopqrstuvwx" },
        runId: "run_1",
        status: "queued",
      },
    ]);

    await bulkDeleteKeywords({ keywordIds: [KEYWORD_PUBLIC_ID], projectId: PROJECT_PUBLIC_ID });

    expect(mocks.prisma.rankCheckRunItem.updateMany).toHaveBeenCalledWith({
      data: {
        claimExpiresAt: null,
        finishedAt: expect.any(Date),
        status: "cancelled",
      },
      where: {
        OR: [{ status: "queued" }, { rankCheckId: null, status: "running" }],
        id: "item_1",
      },
    });
    // Counters are recomputed from rows at finalize; deletion never touches the run row.
    expect(mocks.prisma.rankCheckRun.update).not.toHaveBeenCalled();
    expect(mocks.prisma.keyword.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["keyword_1"] } },
    });
  });

  it("refuses deletion while an active run is checking the selected keywords", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValueOnce([
      { id: "keyword_1", publicId: KEYWORD_PUBLIC_ID, text: "rank tracker" },
      { id: "keyword_2", publicId: "kw_zbcdefghijklmnopqrstuvwx", text: "seo tool" },
    ]);
    mocks.prisma.rankCheckRunItem.findMany.mockResolvedValueOnce([
      {
        id: "item_1",
        keywordId: "keyword_1",
        rankCheckId: "rank_1",
        run: { publicId: "rcr_abcdefghijklmnopqrstuvwx" },
        runId: "run_1",
        status: "running",
      },
      {
        id: "item_2",
        keywordId: "keyword_2",
        rankCheckId: "rank_2",
        run: { publicId: "rcr_abcdefghijklmnopqrstuvwx" },
        runId: "run_1",
        status: "running",
      },
    ]);

    await expect(
      bulkDeleteKeywords({
        keywordIds: [KEYWORD_PUBLIC_ID, "kw_zbcdefghijklmnopqrstuvwx"],
        projectId: PROJECT_PUBLIC_ID,
      }),
    ).rejects.toThrow("Run rcr_abcdefghijklmnopqrstuvwx is still checking 2 keywords.");

    expect(mocks.prisma.keyword.deleteMany).not.toHaveBeenCalled();
    expect(mocks.prisma.rankCheckRunItem.updateMany).not.toHaveBeenCalled();
  });
});
