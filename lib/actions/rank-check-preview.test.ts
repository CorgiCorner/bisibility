import { ProviderRateLimitedError } from "@/lib/providers/rate-limit";
import { BudgetExhaustedError } from "@/lib/rank-check/budget";
import { RankCheckRunnerError } from "@/lib/rank-check/runner";
import { appPath } from "@/lib/routing/app-path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getFirstCheckRunPlan,
  listFirstCheckCandidates,
  runFirstCheckPreview,
} from "./rank-check-preview";

const KEYWORD_PUBLIC_ID = "kw_abcdefghijklmnopqrstuvwx";
const SECOND_KEYWORD_PUBLIC_ID = "kw_bcdefghijklmnopqrstuvwxy";
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

  it("lists only keywords without completed checks and keeps target URLs first", async () => {
    mocks.prisma.keyword.findMany
      .mockResolvedValueOnce([
        { id: "keyword_1", publicId: KEYWORD_PUBLIC_ID, text: "rank tracker" },
      ])
      .mockResolvedValueOnce([
        { id: "keyword_2", publicId: SECOND_KEYWORD_PUBLIC_ID, text: "seo api" },
      ]);
    mocks.prisma.providerConnection.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    const result = await listFirstCheckCandidates({ limit: 2, projectId: PROJECT_PUBLIC_ID });

    expect(result).toEqual({
      candidates: [
        { id: "keyword_1", publicId: KEYWORD_PUBLIC_ID, text: "rank tracker" },
        { id: "keyword_2", publicId: SECOND_KEYWORD_PUBLIC_ID, text: "seo api" },
      ],
      hasAnalyticsSource: false,
      isSampleProject: false,
      providerReady: true,
    });
    expect(mocks.prisma.keyword.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        orderBy: { createdAt: "asc" },
        take: 2,
        where: {
          projectId: "project_1",
          rankChecks: { none: { status: "completed" } },
          targetUrl: { not: null },
        },
      }),
    );
    expect(mocks.prisma.keyword.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        orderBy: { createdAt: "asc" },
        take: 1,
        where: {
          projectId: "project_1",
          rankChecks: { none: { status: "completed" } },
          targetUrl: null,
        },
      }),
    );
  });

  it("short-circuits candidate listing for sample projects", async () => {
    mocks.prisma.project.findFirst.mockResolvedValueOnce({
      id: "project_1",
      isSample: true,
      ownerId: "user_1",
      publicId: SAMPLE_PROJECT_PUBLIC_ID,
      writeMode: "active",
      writeModeChangedAt: null,
      writeModeChangedById: null,
    });
    mocks.prisma.providerConnection.count.mockResolvedValueOnce(1);

    const result = await listFirstCheckCandidates({
      limit: 2,
      projectId: SAMPLE_PROJECT_PUBLIC_ID,
    });

    expect(result).toEqual({
      candidates: [],
      hasAnalyticsSource: true,
      isSampleProject: true,
      providerReady: false,
    });
    expect(mocks.prisma.keyword.findMany).not.toHaveBeenCalled();
  });

  it("returns the ready count and provider fallback order", async () => {
    mocks.loadSerpProviderChain.mockResolvedValue([
      { costPerCheckCents: 0.25, credentialsEncrypted: "secret-a", provider: "dataforseo" },
      { credentialsEncrypted: "secret-b", provider: "secondary" },
    ]);
    // biome-ignore format: compact fixture keeps this test under the project line cap.
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue({ city: null, country: "Poland", device: "mobile", frequency: "weekly", locationKey: "PL", serpDepth: 50 });

    const result = await getFirstCheckRunPlan({ projectId: PROJECT_PUBLIC_ID });

    // biome-ignore format: compact assertion keeps this test under the project line cap.
    expect(result).toMatchObject({ budget: { capCents: 100, spentCents: 0 }, estimatedCostPerCheckCents: 0.25, providerReady: true, providers: ["dataforseo", "secondary"], readyCount: 2, scope: { depth: "Top 50", device: "Mobile", engine: "Google", frequency: "Weekly", location: "Poland" } });
    expect(mocks.prisma.keyword.count).toHaveBeenCalledWith({
      where: { projectId: "project_1", rankChecks: { none: { status: "completed" } } },
    });
  });

  it("preserves an explicit zero-cost provider estimate", async () => {
    mocks.loadSerpProviderChain.mockResolvedValue([
      { costPerCheckCents: 0, credentialsEncrypted: null, provider: "local-sequence" },
    ]);

    await expect(getFirstCheckRunPlan({ projectId: PROJECT_PUBLIC_ID })).resolves.toMatchObject({
      estimatedCostPerCheckCents: 0,
      providerReady: true,
    });
  });

  it("reports no ready provider when the chain is empty", async () => {
    const result = await getFirstCheckRunPlan({ projectId: PROJECT_PUBLIC_ID });
    expect(result).toMatchObject({ providerReady: false, providers: [] });
  });

  it("falls back to the default preview depth for an unsupported stored value", async () => {
    mocks.prisma.projectDefaults.findUnique.mockResolvedValueOnce({ serpDepth: 30 });
    expect((await getFirstCheckRunPlan({ projectId: PROJECT_PUBLIC_ID })).scope.depth).toBe(
      "Top 100",
    );
  });

  it("short-circuits run plans for sample projects", async () => {
    // biome-ignore format: compact fixture keeps this test under the project line cap.
    mocks.prisma.project.findFirst.mockResolvedValueOnce({
      id: "project_1", isSample: true, ownerId: "user_1", publicId: SAMPLE_PROJECT_PUBLIC_ID, writeMode: "active",
    });
    mocks.monthlySpendCents.mockResolvedValueOnce(42);
    const result = await getFirstCheckRunPlan({ projectId: SAMPLE_PROJECT_PUBLIC_ID });
    // biome-ignore format: compact assertion keeps this test under the project line cap.
    expect(result).toMatchObject({ budget: { capCents: 100, spentCents: 42 }, budgetExhausted: false, estimatedCostPerCheckCents: null, isSampleProject: true, providerReady: false, providers: [], readyCount: 0, scope: { depth: "Top 100" } });
    expect(mocks.prisma.keyword.count).not.toHaveBeenCalled();
  });

  it("reports exhausted budget when monthly spend reaches the cap", async () => {
    mocks.monthlySpendCents.mockResolvedValueOnce(100);
    await expect(getFirstCheckRunPlan({ projectId: PROJECT_PUBLIC_ID })).resolves.toMatchObject({
      budgetExhausted: true,
    });
  });

  it("does not serialize provider credentials", async () => {
    // biome-ignore format: compact fixture keeps this test under the project line cap.
    mocks.loadSerpProviderChain.mockResolvedValue([{ credentialsEncrypted: "secret", provider: "primary" }]);
    const result = await getFirstCheckRunPlan({ projectId: PROJECT_PUBLIC_ID });
    expect(JSON.stringify(result)).not.toMatch(/credential/i);
  });
});
