import { runCheckNow } from "@/lib/actions/rankCheck";
import { appPath } from "@/lib/routing/app-path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const KEYWORD_PUBLIC_ID = "kw_abcdefghijklmnopqrstuvwx";
const PROJECT_PUBLIC_ID = "prj_abcdefghijklmnopqrstuvwx";
const RANK_CHECK_PUBLIC_ID = "check_abcdefghijklmnopqrstuvwx";
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
    assertBudgetAvailable: vi.fn(),
    authorize: vi.fn(),
    isBudgetExhaustedError: vi.fn(
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "budget_exhausted",
    ),
    loadSerpProviderChain: vi.fn(),
    manualRankCheckWorkflowId: vi.fn((keywordId: string) => `rank-check-${keywordId}-manual`),
    prisma: {
      keyword: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
      keywordSchedule: { createMany: vi.fn(), updateMany: vi.fn() },
      project: { findFirst: vi.fn() },
      projectDefaults: { findUnique: vi.fn() },
      providerConnection: { count: vi.fn() },
      user: { findUnique: vi.fn() },
    },
    rankCheckSearchAttributes: vi.fn(
      (input: { keywordId: string; projectId: string; provider?: string }) => ({
        keywordId: [input.keywordId],
        projectId: [input.projectId],
        provider: [input.provider ?? "primary"],
      }),
    ),
    requireSession: vi.fn(),
    revalidatePath: vi.fn(),
    runKeywordCheckWithFallback: vi.fn(),
    startRankCheckWorkflow: vi.fn(),
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
vi.mock("@/lib/rank-check/budget", () => ({
  assertBudgetAvailable: mocks.assertBudgetAvailable,
  isBudgetExhaustedError: mocks.isBudgetExhaustedError,
}));
vi.mock("@/lib/rank-check/fallback", () => ({
  loadSerpProviderChain: mocks.loadSerpProviderChain,
  runKeywordCheckWithFallback: mocks.runKeywordCheckWithFallback,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/temporal/client", () => ({
  manualRankCheckWorkflowId: mocks.manualRankCheckWorkflowId,
  rankCheckSearchAttributes: mocks.rankCheckSearchAttributes,
  startRankCheckWorkflow: mocks.startRankCheckWorkflow,
}));
describe("runCheckNow", () => {
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
    mocks.prisma.keyword.findMany.mockResolvedValue([]);
    mocks.prisma.keyword.findUnique.mockResolvedValue({
      project: {
        budgetCapCents: 5_000,
        defaults: { serpDepth: 100 },
      },
      queuedRankCheckTasks: [],
      rankChecks: [],
      schedule: null,
    });
    mocks.prisma.keywordSchedule.createMany.mockResolvedValue({ count: 0 });
    mocks.prisma.keywordSchedule.updateMany.mockResolvedValue({ count: 0 });
    mocks.prisma.project.findFirst.mockResolvedValue({
      id: "project_1",
      ownerId: "user_1",
      publicId: PROJECT_PUBLIC_ID,
      writeMode: "active",
      writeModeChangedAt: null,
      writeModeChangedById: null,
    });
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue({
      cronExpression: null,
      frequency: "daily",
      jitterMinutes: 60,
      lastCheckedAt: null,
      timezone: "UTC",
    });
    mocks.prisma.providerConnection.count.mockResolvedValue(1);
    mocks.loadSerpProviderChain.mockResolvedValue([
      { costPerCheckCents: 0.75, credentialsEncrypted: "secret", provider: "dataforseo" },
    ]);
    mocks.assertBudgetAvailable.mockResolvedValue({ capCents: 5_000, spentCents: 100 });
    mocks.startRankCheckWorkflow.mockResolvedValue({
      runId: "run_1",
      workflowId: "rank-check-keyword_1-manual",
    });
    mocks.runKeywordCheckWithFallback.mockResolvedValue({
      attempts: [],
      provider: "dataforseo",
      rankCheck: {
        billingUnits: 1,
        id: "rank_1",
        position: 3,
        publicId: RANK_CHECK_PUBLIC_ID,
        requestedDepth: 100,
      },
    });
  });
  it("rejects invalid input before reading the session", async () => {
    await expect(runCheckNow({ keywordId: "" })).rejects.toThrow();
    await expect(runCheckNow({ depth: 30, keywordId: KEYWORD_PUBLIC_ID })).rejects.toThrow();
    expect(mocks.requireSession).not.toHaveBeenCalled();
    expect(mocks.startRankCheckWorkflow).not.toHaveBeenCalled();
  });
  it("starts a durable workflow with workflow search attributes", async () => {
    const result = await runCheckNow({
      depth: 20,
      keywordId: KEYWORD_PUBLIC_ID,
      providerId: "dataforseo",
    });
    expect(mocks.startRankCheckWorkflow).toHaveBeenCalledWith(
      { depth: 20, keywordId: "keyword_1", providerId: "dataforseo" },
      {
        searchAttributes: {
          keywordId: ["keyword_1"],
          projectId: ["project_1"],
          provider: ["dataforseo"],
        },
        workflowId: "rank-check-keyword_1-manual",
      },
    );
    expect(mocks.assertBudgetAvailable).toHaveBeenCalledWith("project_1", expect.any(Date), {
      capCents: 5_000,
      estimatedCostCents: 0.75,
    });
    expect(result).toEqual({ status: "running" });
  });
  it("serializes an exhausted budget before starting a workflow or fallback check", async () => {
    const error = Object.assign(new Error("Rank check monthly budget reached."), {
      code: "budget_exhausted",
      status: 429,
    });
    mocks.assertBudgetAvailable.mockRejectedValueOnce(error);
    await expect(runCheckNow({ depth: 100, keywordId: KEYWORD_PUBLIC_ID })).resolves.toEqual({
      code: "budget_exhausted",
      message: "Rank check monthly budget reached.",
      status: "not_started",
    });
    expect(mocks.startRankCheckWorkflow).not.toHaveBeenCalled();
    expect(mocks.runKeywordCheckWithFallback).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });
  it("still rejects unexpected budget preflight errors", async () => {
    const error = new Error("Budget lookup failed");
    mocks.assertBudgetAvailable.mockRejectedValueOnce(error);
    await expect(runCheckNow({ depth: 100, keywordId: KEYWORD_PUBLIC_ID })).rejects.toBe(error);
    expect(mocks.startRankCheckWorkflow).not.toHaveBeenCalled();
    expect(mocks.runKeywordCheckWithFallback).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });
  it("preserves the zero-cost provider preflight path", async () => {
    mocks.loadSerpProviderChain.mockResolvedValueOnce([
      { costPerCheckCents: 0, credentialsEncrypted: null, provider: "local-sequence" },
    ]);
    await runCheckNow({ depth: 100, keywordId: KEYWORD_PUBLIC_ID });
    expect(mocks.assertBudgetAvailable).toHaveBeenCalledWith("project_1", expect.any(Date), {
      capCents: 5_000,
      estimatedCostCents: 0,
    });
    expect(mocks.startRankCheckWorkflow).toHaveBeenCalledOnce();
  });
  it("audits and revalidates after the workflow is started", async () => {
    await runCheckNow({ keywordId: KEYWORD_PUBLIC_ID });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "rank_check.run_now",
        after: {
          keywordId: KEYWORD_PUBLIC_ID,
          provider: "primary",
          status: "running",
          text: "rank tracker",
        },
        projectId: "project_1",
        targetId: KEYWORD_PUBLIC_ID,
      }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(appPath("[project]", "keywords"), "page");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(appPath("[project]", "alerts"), "page");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(appPath("[project]", "competitors"), "page");
  });
  it("runs the check inline when Temporal is unavailable", async () => {
    mocks.startRankCheckWorkflow.mockRejectedValueOnce(
      new Error("14 UNAVAILABLE: No connection established"),
    );
    mocks.runKeywordCheckWithFallback.mockResolvedValueOnce({
      attempts: [{ message: "failed", provider: "serpapi" }],
      provider: "dataforseo",
      rankCheck: {
        billingUnits: 1,
        id: "rank_inline_1",
        position: 2,
        publicId: RANK_CHECK_PUBLIC_ID,
        requestedDepth: 50,
      },
    });
    const result = await runCheckNow({ depth: 50, keywordId: KEYWORD_PUBLIC_ID });
    expect(mocks.runKeywordCheckWithFallback).toHaveBeenCalledWith({
      depth: 50,
      keywordId: "keyword_1",
      providerId: undefined,
    });
    expect(result).toEqual({
      attempts: 1,
      billingUnits: 1,
      position: 2,
      provider: "dataforseo",
      rankCheckId: RANK_CHECK_PUBLIC_ID,
      requestedDepth: 50,
      status: "completed",
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({
          position: 2,
          provider: "dataforseo",
          rankCheckId: RANK_CHECK_PUBLIC_ID,
          status: "completed",
        }),
      }),
    );
  });
  it("does not start workflows or provider checks for sample projects", async () => {
    mocks.prisma.keyword.findFirst.mockResolvedValueOnce({
      id: "keyword_1",
      project: {
        id: "project_1",
        isSample: true,
        publicId: "prj_a11111111111111111111111",
        writeMode: "active",
      },
      projectId: "project_1",
      publicId: KEYWORD_PUBLIC_ID,
      text: "rank tracker",
    });
    await expect(runCheckNow({ keywordId: KEYWORD_PUBLIC_ID })).rejects.toThrow(
      "Sample projects don't run real checks.",
    );
    expect(mocks.startRankCheckWorkflow).not.toHaveBeenCalled();
    expect(mocks.runKeywordCheckWithFallback).not.toHaveBeenCalled();
  });
  it("does not run inline for non-connectivity Temporal errors", async () => {
    mocks.startRankCheckWorkflow.mockRejectedValueOnce(new Error("Workflow already exists"));
    await expect(runCheckNow({ keywordId: KEYWORD_PUBLIC_ID })).rejects.toThrow(
      "Workflow already exists",
    );
    expect(mocks.runKeywordCheckWithFallback).not.toHaveBeenCalled();
  });
});
