import { ProviderRateLimitedError } from "@/lib/providers/rate-limit";
import { BudgetExhaustedError } from "@/lib/rank-check/budget";
import { RankCheckRunnerError } from "@/lib/rank-check/runner";
import { appPath } from "@/lib/routing/app-path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runFirstCheckPreview } from "./rank-check-preview";

const KEYWORD_PUBLIC_ID = "kw_abcdefghijklmnopqrstuvwx";
const PROJECT_PUBLIC_ID = "prj_abcdefghijklmnopqrstuvwx";
const SAMPLE_PROJECT_PUBLIC_ID = "prj_bcdefghijklmnopqrstuvwxy";

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
    loadSerpProviderChain: vi.fn(),
    monthlySpendCents: vi.fn(),
    prisma: {
      keyword: { count: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
      keywordTrafficSnapshot: { findMany: vi.fn() },
      project: { findFirst: vi.fn(), findUnique: vi.fn() },
      projectDefaults: { findUnique: vi.fn() },
      providerConnection: { count: vi.fn() },
      user: { findUnique: vi.fn() },
    },
    requireSession: vi.fn(),
    revalidatePath: vi.fn(),
    runKeywordCheckWithFallback: vi.fn(),
    writeAudit: vi.fn(),
  };
});
vi.mock("@/lib/auth/authorize", () => ({
  AuthorizationError: mocks.AuthorizationError,
  authorize: mocks.authorize,
}));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.writeAudit,
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/rank-check/budget", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rank-check/budget")>()),
  monthlySpendCents: mocks.monthlySpendCents,
}));
vi.mock("@/lib/rank-check/fallback", () => ({
  loadSerpProviderChain: mocks.loadSerpProviderChain,
  runKeywordCheckWithFallback: mocks.runKeywordCheckWithFallback,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
// biome-ignore format: compact fixture keeps this test under the project line cap.
function defaultKeyword(writeMode = "active") { return { id: "keyword_1", project: { id: "project_1", isSample: false, publicId: PROJECT_PUBLIC_ID, writeMode }, projectId: "project_1", publicId: KEYWORD_PUBLIC_ID, text: "rank tracker" }; }
describe("rank check preview actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.prisma.user.findUnique.mockResolvedValue({
      memberships: [{ projectId: "project_1", role: "admin" }],
      role: "member",
    });
    mocks.prisma.project.findFirst.mockResolvedValue({
      id: "project_1",
      isSample: false,
      ownerId: "user_1",
      publicId: PROJECT_PUBLIC_ID,
      writeMode: "active",
      writeModeChangedAt: null,
      writeModeChangedById: null,
    });
    mocks.loadSerpProviderChain.mockResolvedValue([]);
    mocks.monthlySpendCents.mockResolvedValue(0);
    mocks.prisma.keyword.count.mockResolvedValue(2);
    mocks.prisma.keyword.findFirst.mockResolvedValue(defaultKeyword());
    mocks.prisma.keyword.findMany.mockReset().mockResolvedValue([]);
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue(null);
    mocks.prisma.providerConnection.count.mockReset();
    mocks.prisma.project.findUnique.mockResolvedValue({ budgetCapCents: 100 });
    mocks.runKeywordCheckWithFallback.mockResolvedValue({
      attempts: [],
      provider: "dataforseo",
      rankCheck: {
        id: "rank_1",
        position: 3,
        publicId: "check_abcdefghijklmnopqrstuvwx",
        rankingUrl: "https://example.com/page",
      },
    });
  });

  it("enforces keyword update authorization before running the preview", async () => {
    mocks.authorize.mockImplementationOnce(() => {
      throw new mocks.AuthorizationError("forbidden");
    });

    await expect(runFirstCheckPreview({ keywordId: KEYWORD_PUBLIC_ID })).rejects.toBeInstanceOf(
      mocks.AuthorizationError,
    );
    expect(mocks.runKeywordCheckWithFallback).not.toHaveBeenCalled();
  });

  it("runs the fallback check directly and audits the preview result", async () => {
    const result = await runFirstCheckPreview({ keywordId: KEYWORD_PUBLIC_ID });

    expect(mocks.runKeywordCheckWithFallback).toHaveBeenCalledWith({ keywordId: "keyword_1" });
    expect(result).toEqual({
      position: 3,
      provider: "dataforseo",
      rankingUrl: "https://example.com/page",
      status: "completed",
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "rank_check.run_now",
        after: expect.objectContaining({ keywordId: KEYWORD_PUBLIC_ID, preview: true }),
        projectId: "project_1",
        targetId: "check_abcdefghijklmnopqrstuvwx",
        targetType: "rank_check",
      }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      appPath("[project]", "keywords", "[id]"),
      "page",
    );
  });

  it.each([
    [
      "the budget is exhausted",
      new BudgetExhaustedError({ capCents: 500, projectId: "project_1", spentCents: 500 }),
      "budget_exhausted",
    ],
    [
      "no provider is connected",
      new RankCheckRunnerError("no_provider_connected", "Connect a SERP provider."),
      "no_provider",
    ],
    [
      "the provider rate limit is reached",
      new ProviderRateLimitedError("dataforseo"),
      "rate_limited",
    ],
  ] as const)("maps the expected failure when %s", async (_caseName, error, code) => {
    mocks.runKeywordCheckWithFallback.mockRejectedValueOnce(error);

    const result = await runFirstCheckPreview({ keywordId: KEYWORD_PUBLIC_ID });

    expect(result).toMatchObject({ code, status: "failed" });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({ code, preview: true, status: "failed" }),
        targetId: KEYWORD_PUBLIC_ID,
        targetType: "keyword",
      }),
    );
  });

  it("resolves an unexpected adapter exception as a failed row", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.runKeywordCheckWithFallback.mockRejectedValueOnce(new Error("Adapter exploded."));

    try {
      await expect(runFirstCheckPreview({ keywordId: KEYWORD_PUBLIC_ID })).resolves.toEqual({
        code: "unexpected",
        message: "Check failed on our side. Retry in a moment.",
        status: "failed",
      });
      expect(consoleError).toHaveBeenCalledWith("[rank-check-preview] unexpected failure", {
        error: expect.stringContaining("Error: Adapter exploded."),
        keywordId: KEYWORD_PUBLIC_ID,
        projectId: PROJECT_PUBLIC_ID,
      });
    } finally {
      consoleError.mockRestore();
    }
  });

  it("returns a typed result for read-only projects without running a check", async () => {
    mocks.prisma.keyword.findFirst.mockResolvedValueOnce(defaultKeyword("migration_hold"));

    const result = await runFirstCheckPreview({ keywordId: KEYWORD_PUBLIC_ID });

    expect(result).toEqual({
      code: "project_read_only",
      message: "This project is read-only right now.",
      status: "failed",
    });
    expect(mocks.runKeywordCheckWithFallback).not.toHaveBeenCalled();
  });

  it("returns a typed result for sample projects without running a provider check", async () => {
    mocks.prisma.keyword.findFirst.mockResolvedValueOnce({
      ...defaultKeyword(),
      project: {
        id: "project_1",
        isSample: true,
        publicId: SAMPLE_PROJECT_PUBLIC_ID,
        writeMode: "active",
      },
    });

    const result = await runFirstCheckPreview({ keywordId: KEYWORD_PUBLIC_ID });

    expect(result).toEqual({
      code: "sample_project",
      message: "Sample projects don't run real checks.",
      status: "failed",
    });
    expect(mocks.runKeywordCheckWithFallback).not.toHaveBeenCalled();
  });
});
