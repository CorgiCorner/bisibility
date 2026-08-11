import { runCheckNow } from "@/lib/actions/rankCheck";
import {
  ACTIVE_QUEUED_TASK_STATES,
  TERMINAL_QUEUED_TASK_STATES,
} from "@/lib/rank-check/queued-state";
import { beforeEach, describe, expect, it, vi } from "vitest";

const KEYWORD_PUBLIC_ID = "kw_abcdefghijklmnopqrstuvwx";
const PROJECT_PUBLIC_ID = "prj_abcdefghijklmnopqrstuvwx";
const IN_FLIGHT_RESULT = {
  code: "check_in_progress",
  message: "A rank check is already queued or running.",
  status: "not_started",
} as const;

function firstState(states: readonly string[]) {
  const state = states[0];
  if (!state) throw new Error("Expected a queued rank-check state.");
  return state;
}

const ACTIVE_QUEUED_TASK_STATE = firstState(ACTIVE_QUEUED_TASK_STATES);
const TERMINAL_QUEUED_TASK_STATE = firstState(TERMINAL_QUEUED_TASK_STATES);

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
    isBudgetExhaustedError: vi.fn(),
    loadSerpProviderChain: vi.fn(),
    manualRankCheckWorkflowId: vi.fn((keywordId: string) => `rank-check-${keywordId}-manual`),
    prisma: {
      keyword: { findFirst: vi.fn(), findUnique: vi.fn() },
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
vi.mock("@/lib/temporal/client", () => ({
  manualRankCheckWorkflowId: mocks.manualRankCheckWorkflowId,
  rankCheckSearchAttributes: mocks.rankCheckSearchAttributes,
  startRankCheckWorkflow: mocks.startRankCheckWorkflow,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

function rankCheckContext({
  queuedRankCheckTasks = [],
  rankChecks = [],
}: {
  queuedRankCheckTasks?: Array<{ state: string }>;
  rankChecks?: Array<{ status: string }>;
} = {}) {
  return {
    project: { budgetCapCents: 5_000, defaults: { serpDepth: 100 } },
    queuedRankCheckTasks,
    rankChecks,
    schedule: null,
  };
}

describe("runCheckNow in-flight guard", () => {
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
    mocks.prisma.keyword.findUnique.mockResolvedValue(rankCheckContext());
    mocks.loadSerpProviderChain.mockResolvedValue([
      { costPerCheckCents: 0.75, credentialsEncrypted: "secret", provider: "dataforseo" },
    ]);
    mocks.assertBudgetAvailable.mockResolvedValue({ capCents: 5_000, spentCents: 100 });
    mocks.startRankCheckWorkflow.mockResolvedValue({ runId: "run_1" });
  });

  it("proceeds when the selected state has no in-flight work", async () => {
    await expect(runCheckNow({ keywordId: KEYWORD_PUBLIC_ID })).resolves.toEqual({
      status: "running",
    });

    expect(mocks.prisma.keyword.findUnique).toHaveBeenCalledWith({
      select: expect.objectContaining({
        queuedRankCheckTasks: {
          select: { state: true },
          take: 1,
          where: { state: { in: ACTIVE_QUEUED_TASK_STATES } },
        },
        rankChecks: {
          orderBy: [{ checkedAt: "desc" }, { id: "desc" }],
          select: { status: true },
          take: 1,
        },
      }),
      where: { id: "keyword_1" },
    });
    expect(mocks.assertBudgetAvailable).toHaveBeenCalledOnce();
    expect(mocks.startRankCheckWorkflow).toHaveBeenCalledOnce();
  });

  it("refuses an active queued task before budget consumption or workflow start", async () => {
    mocks.prisma.keyword.findUnique.mockResolvedValueOnce(
      rankCheckContext({ queuedRankCheckTasks: [{ state: ACTIVE_QUEUED_TASK_STATE }] }),
    );

    await expect(runCheckNow({ keywordId: KEYWORD_PUBLIC_ID })).resolves.toEqual(IN_FLIGHT_RESULT);

    expect(mocks.assertBudgetAvailable).not.toHaveBeenCalled();
    expect(mocks.loadSerpProviderChain).not.toHaveBeenCalled();
    expect(mocks.startRankCheckWorkflow).not.toHaveBeenCalled();
  });

  it("refuses when the latest rank check is running", async () => {
    mocks.prisma.keyword.findUnique.mockResolvedValueOnce(
      rankCheckContext({ rankChecks: [{ status: "running" }] }),
    );

    await expect(runCheckNow({ keywordId: KEYWORD_PUBLIC_ID })).resolves.toEqual(IN_FLIGHT_RESULT);

    expect(mocks.assertBudgetAvailable).not.toHaveBeenCalled();
    expect(mocks.startRankCheckWorkflow).not.toHaveBeenCalled();
  });

  it("proceeds when a terminal queued task is filtered out by the selected active states", async () => {
    const task = { state: TERMINAL_QUEUED_TASK_STATE };
    mocks.prisma.keyword.findUnique.mockImplementationOnce(
      ({ select }: { select: { queuedRankCheckTasks: { where: { state: { in: string[] } } } } }) =>
        Promise.resolve(
          rankCheckContext({
            queuedRankCheckTasks: [task].filter(({ state }) =>
              select.queuedRankCheckTasks.where.state.in.includes(state),
            ),
          }),
        ),
    );

    await expect(runCheckNow({ keywordId: KEYWORD_PUBLIC_ID })).resolves.toEqual({
      status: "running",
    });

    expect(mocks.assertBudgetAvailable).toHaveBeenCalledOnce();
    expect(mocks.startRankCheckWorkflow).toHaveBeenCalledOnce();
  });

  it("audits an in-flight refusal distinctly from a successful run", async () => {
    mocks.prisma.keyword.findUnique.mockResolvedValueOnce(
      rankCheckContext({ queuedRankCheckTasks: [{ state: ACTIVE_QUEUED_TASK_STATE }] }),
    );

    await runCheckNow({ keywordId: KEYWORD_PUBLIC_ID });

    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "rank_check.run_now",
        after: {
          ...IN_FLIGHT_RESULT,
          keywordId: KEYWORD_PUBLIC_ID,
          provider: "primary",
          text: "rank tracker",
        },
        projectId: "project_1",
        targetId: KEYWORD_PUBLIC_ID,
        targetType: "keyword",
      }),
    );
  });

  it("does not start a workflow when authorization fails", async () => {
    mocks.authorize.mockImplementationOnce(() => {
      throw new mocks.AuthorizationError("forbidden");
    });
    await expect(runCheckNow({ keywordId: KEYWORD_PUBLIC_ID })).rejects.toBeInstanceOf(
      mocks.AuthorizationError,
    );
    expect(mocks.startRankCheckWorkflow).not.toHaveBeenCalled();
  });

  it("rejects raw keyword IDs before they can reach Temporal", async () => {
    await expect(runCheckNow({ keywordId: "keyword_1" })).rejects.toThrow("Keyword not found.");
    expect(mocks.prisma.keyword.findFirst).not.toHaveBeenCalled();
    expect(mocks.startRankCheckWorkflow).not.toHaveBeenCalled();
  });
});
