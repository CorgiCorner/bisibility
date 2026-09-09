import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActionActor: vi.fn(),
  keywordFindUnique: vi.fn(),
  keywordUpdate: vi.fn(),
  revalidateKeywordViews: vi.fn(),
  requireKeywordScope: vi.fn(),
  transaction: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    keyword: { findUnique: mocks.keywordFindUnique, update: mocks.keywordUpdate },
  },
}));
vi.mock("./_shared", () => ({
  getActionActor: mocks.getActionActor,
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
  requireKeywordScope: mocks.requireKeywordScope,
  revalidateKeywordViews: mocks.revalidateKeywordViews,
}));

import { resetKeywordTargetToInherit } from "./keyword-target-reset";

describe("resetKeywordTargetToInherit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActionActor.mockResolvedValue({ id: "user_1", memberships: [], role: "admin" });
    mocks.requireKeywordScope.mockResolvedValue({
      id: "keyword_1",
      projectId: "project_1",
      publicId: "kw_123456789012345678901234",
      text: "rank tracker",
    });
    mocks.keywordFindUnique.mockResolvedValue({
      device: "desktop",
      locationId: "location_1",
      targetUrl: "https://example.com/es/self-host",
      text: "rank tracker",
    });
    mocks.keywordUpdate.mockResolvedValue({
      publicId: "kw_123456789012345678901234",
      targetUrl: null,
    });
    mocks.transaction.mockImplementation((callback) =>
      callback({ keyword: { findUnique: mocks.keywordFindUnique, update: mocks.keywordUpdate } }),
    );
  });

  it("authorizes, clears only the row target URL, and writes one audit entry", async () => {
    await expect(
      resetKeywordTargetToInherit({ keywordId: "kw_123456789012345678901234" }),
    ).resolves.toEqual({ keywordId: "kw_123456789012345678901234", targetUrl: null });

    expect(mocks.requireKeywordScope).toHaveBeenCalledWith(
      expect.anything(),
      "update",
      "kw_123456789012345678901234",
    );
    expect(mocks.keywordUpdate).toHaveBeenCalledWith({
      data: { targetUrl: null },
      select: { publicId: true, targetUrl: true },
      where: { id: "keyword_1" },
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "keyword.target_url_reset",
        after: { targetUrl: null },
        before: { targetUrl: "https://example.com/es/self-host" },
        projectId: "project_1",
      }),
      expect.anything(),
    );
    expect(mocks.revalidateKeywordViews).toHaveBeenCalledWith("kw_123456789012345678901234");
  });

  it("rejects an immutable identity payload before any mutation", async () => {
    await expect(
      resetKeywordTargetToInherit({
        keywordId: "kw_123456789012345678901234",
        text: "other term",
      }),
    ).rejects.toThrow();
    expect(mocks.requireKeywordScope).not.toHaveBeenCalled();
    expect(mocks.keywordUpdate).not.toHaveBeenCalled();
  });

  it("does not revalidate after an audit failure", async () => {
    mocks.writeAudit.mockRejectedValueOnce(new Error("audit unavailable"));
    await expect(
      resetKeywordTargetToInherit({ keywordId: "kw_123456789012345678901234" }),
    ).rejects.toThrow("audit unavailable");
    expect(mocks.revalidateKeywordViews).not.toHaveBeenCalled();
  });
});
