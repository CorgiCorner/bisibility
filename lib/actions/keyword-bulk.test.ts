import { beforeEach, describe, expect, it, vi } from "vitest";
import { bulkClearTargetUrls, bulkDeleteKeywords, bulkSetTargetUrl } from "./keyword-bulk";

const KEYWORD_PUBLIC_ID = "kw_abcdefghijklmnopqrstuvwx";
const PROJECT_PUBLIC_ID = "prj_abcdefghijklmnopqrstuvwx";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  prisma: {
    keyword: { deleteMany: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    project: { findFirst: vi.fn() },
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
});
