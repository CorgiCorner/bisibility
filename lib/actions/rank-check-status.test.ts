import { getRankCheckStatus } from "@/lib/actions/rank-check-status";
import { beforeEach, describe, expect, it, vi } from "vitest";

const CHECK_PUBLIC_ID = "check_abcdefghijklmnopqrstuvwx";
const KEYWORD_PUBLIC_ID = "kw_abcdefghijklmnopqrstuvwx";
const PROJECT_PUBLIC_ID = "prj_abcdefghijklmnopqrstuvwx";

const mocks = vi.hoisted(() => {
  class AuthorizationError extends Error {
    code: "forbidden" | "unauthenticated";
    constructor(code: "forbidden" | "unauthenticated") {
      super("You are not authorized to perform this action.");
      this.code = code;
      this.name = "AuthorizationError";
    }
  }
  return {
    AuthorizationError,
    authorize: vi.fn(),
    prisma: {
      keyword: { findFirst: vi.fn() },
      rankCheck: { findUnique: vi.fn() },
      user: { findUnique: vi.fn() },
    },
    requireSession: vi.fn(),
  };
});

vi.mock("@/lib/auth/authorize", () => ({
  AuthorizationError: mocks.AuthorizationError,
  authorize: mocks.authorize,
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

describe("getRankCheckStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.prisma.user.findUnique.mockResolvedValue({
      memberships: [{ projectId: "project_1", role: "admin" }],
      role: "member",
    });
    mocks.prisma.keyword.findFirst.mockResolvedValue({
      id: "keyword_1",
      project: {
        id: "project_1",
        isSample: false,
        publicId: PROJECT_PUBLIC_ID,
        writeMode: "active",
      },
      projectId: "project_1",
      publicId: KEYWORD_PUBLIC_ID,
      text: "rank tracker",
    });
    mocks.authorize.mockReturnValue(undefined);
    mocks.prisma.rankCheck.findUnique.mockResolvedValue({
      error: null,
      errorCode: null,
      finishedAt: new Date("2026-08-21T12:00:00.000Z"),
      keyword: { publicId: KEYWORD_PUBLIC_ID },
      position: 3,
      requestedDepth: 100,
      status: "completed",
    });
  });

  it("rejects malformed input before reading the session", async () => {
    await expect(getRankCheckStatus({ rankCheckId: "" })).rejects.toThrow();
    expect(mocks.requireSession).not.toHaveBeenCalled();
    expect(mocks.prisma.rankCheck.findUnique).not.toHaveBeenCalled();
  });

  it("rejects a non-check public id before querying the database", async () => {
    await expect(getRankCheckStatus({ rankCheckId: KEYWORD_PUBLIC_ID })).rejects.toThrow(
      "Rank check not found.",
    );
    expect(mocks.prisma.rankCheck.findUnique).not.toHaveBeenCalled();
  });

  it("rejects a missing row", async () => {
    mocks.prisma.rankCheck.findUnique.mockResolvedValueOnce(null);
    await expect(getRankCheckStatus({ rankCheckId: CHECK_PUBLIC_ID })).rejects.toThrow(
      "Rank check not found.",
    );
  });

  it("returns status for an authorized own-project read", async () => {
    const result = await getRankCheckStatus({ rankCheckId: CHECK_PUBLIC_ID });
    expect(result).toEqual({
      error: null,
      errorCode: null,
      finishedAt: "2026-08-21T12:00:00.000Z",
      position: 3,
      requestedDepth: 100,
      status: "completed",
    });
    expect(mocks.prisma.rankCheck.findUnique).toHaveBeenCalledWith({
      select: {
        error: true,
        errorCode: true,
        finishedAt: true,
        keyword: { select: { publicId: true } },
        position: true,
        requestedDepth: true,
        status: true,
      },
      where: { publicId: CHECK_PUBLIC_ID },
    });
  });

  it("returns a neutral not-found response for a rankCheckId whose keyword belongs to another project", async () => {
    const otherKeywordPublicId = "kw_zyxwvutsrqponmlkjihgfedc";
    mocks.prisma.rankCheck.findUnique.mockResolvedValueOnce({
      error: null,
      errorCode: null,
      finishedAt: new Date("2026-08-21T12:00:00.000Z"),
      keyword: { publicId: otherKeywordPublicId },
      position: 3,
      requestedDepth: 100,
      status: "completed",
    });
    mocks.prisma.keyword.findFirst.mockResolvedValueOnce({
      id: "keyword_2",
      project: {
        id: "project_2",
        isSample: false,
        publicId: "prj_zyxwvutsrqponmlkjihgfedc",
        writeMode: "active",
      },
      projectId: "project_2",
      publicId: otherKeywordPublicId,
      text: "rank tracker",
    });
    mocks.authorize.mockImplementationOnce(() => {
      throw new mocks.AuthorizationError("forbidden");
    });
    await expect(getRankCheckStatus({ rankCheckId: CHECK_PUBLIC_ID })).rejects.toThrow(
      "Rank check not found.",
    );
    expect(mocks.prisma.keyword.findFirst).toHaveBeenCalledWith({
      select: {
        id: true,
        project: { select: { id: true, isSample: true, publicId: true, writeMode: true } },
        projectId: true,
        publicId: true,
        text: true,
      },
      where: { publicId: otherKeywordPublicId },
    });
    expect(mocks.authorize).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user_1" }),
      "read",
      { projectId: "project_2", type: "keyword" },
    );
  });

  it("serializes a null finishedAt as null", async () => {
    mocks.prisma.rankCheck.findUnique.mockResolvedValueOnce({
      error: null,
      errorCode: null,
      finishedAt: null,
      keyword: { publicId: KEYWORD_PUBLIC_ID },
      position: null,
      requestedDepth: 50,
      status: "running",
    });
    const result = await getRankCheckStatus({ rankCheckId: CHECK_PUBLIC_ID });
    expect(result).toEqual({
      error: null,
      errorCode: null,
      finishedAt: null,
      position: null,
      requestedDepth: 50,
      status: "running",
    });
  });
});
