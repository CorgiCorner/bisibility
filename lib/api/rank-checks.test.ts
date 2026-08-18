import { beforeEach, describe, expect, it, vi } from "vitest";
import { listRankChecks, runRankCheck } from "./rank-checks";

const mocks = vi.hoisted(() => {
  class RankCheckRunnerError extends Error {
    code = "provider_failed";
  }
  class ProviderChainError extends RankCheckRunnerError {
    constructor(readonly attempts: { provider: string; message: string }[]) {
      super(
        `All SERP providers failed: ${attempts
          .map((attempt) => `${attempt.provider} (${attempt.message})`)
          .join("; ")}`,
      );
      this.name = "ProviderChainError";
    }
  }

  return {
    persistFailedRankCheck: vi.fn(() => Promise.resolve({ id: "rank_failed_1" })),
    ProviderChainError,
    prisma: {
      keyword: { findFirst: vi.fn() },
      rankCheck: { create: vi.fn(), delete: vi.fn(), findMany: vi.fn() },
    },
    RankCheckRunnerError,
    manualRankCheckWorkflowId: vi.fn((keywordId: string) => `rank-check-${keywordId}-manual`),
    rankCheckSearchAttributes: vi.fn(
      (input: { keywordId: string; projectId: string; provider?: string }) => ({
        keywordId: [input.keywordId],
        projectId: [input.projectId],
        provider: [input.provider ?? "primary"],
      }),
    ),
    runKeywordCheckWithFallback: vi.fn(),
    startRankCheckWorkflow: vi.fn(),
    writeAudit: vi.fn(),
  };
});

vi.mock("@/lib/actions/_shared", () => ({
  parseActionInput: vi.fn((schema, input) => schema.parse(input)),
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/rank-check/fallback", () => ({
  ProviderChainError: mocks.ProviderChainError,
  runKeywordCheckWithFallback: mocks.runKeywordCheckWithFallback,
}));
vi.mock("@/lib/rank-check/runner", () => ({
  persistFailedRankCheck: mocks.persistFailedRankCheck,
  RankCheckRunnerError: mocks.RankCheckRunnerError,
}));
vi.mock("@/lib/temporal/client", () => ({
  manualRankCheckWorkflowId: mocks.manualRankCheckWorkflowId,
  rankCheckSearchAttributes: mocks.rankCheckSearchAttributes,
  startRankCheckWorkflow: mocks.startRankCheckWorkflow,
}));

const project = {
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  domain: "example.com",
  id: "project_1",
  name: "Example",
  publicId: "prj_a00000000000000000000000",
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
};

function context(method: string, path: string, body?: unknown) {
  const req = new Request(`https://example.test/api/v1${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    method,
  });
  return {
    auth: {
      apiKey: {
        id: "key_1",
        name: "Key",
        prefix: "bsb_key_live_",
        projectId: project.id,
        scopes: ["admin"] as const,
      },
      project,
    },
    headers: new Headers(),
    instance: "urn:test",
    method,
    path: [],
    req,
    url: new URL(req.url),
  };
}

function rankCheckRow(overrides: Record<string, unknown> = {}) {
  return {
    checkedAt: new Date("2026-06-29T00:00:00.000Z"),
    costCents: null,
    error: null,
    id: "rank_1",
    keyword: { projectId: "project_1", publicId: "kw_a00000000000000000000000" },
    position: null,
    previousPosition: null,
    provider: "serpapi",
    publicId: "check_a00000000000000000000000",
    rankingUrl: null,
    raw: null,
    status: "running",
    ...overrides,
  };
}

describe("rank-check API resources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.keyword.findFirst.mockResolvedValue({
      id: "keyword_1",
      project: { domain: "example.com" },
      projectId: "project_1",
      publicId: "kw_a00000000000000000000000",
      text: "rank tracker",
    });
    mocks.prisma.rankCheck.findMany.mockResolvedValue([]);
    mocks.prisma.rankCheck.create.mockResolvedValue(rankCheckRow());
    mocks.prisma.rankCheck.delete.mockResolvedValue(rankCheckRow());
    mocks.startRankCheckWorkflow.mockResolvedValue({ runId: "run_1", workflowId: "workflow_1" });
  });

  it("filters rank checks by the persisted failed status", async () => {
    const response = await listRankChecks(
      context("GET", "/keywords/kw_a00000000000000000000000/checks?status=failed"),
      "kw_a00000000000000000000000",
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.rankCheck.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ keywordId: "keyword_1", status: "failed" }),
      }),
    );
  });

  it("keeps deferred operational rows out of the default rank-check history", async () => {
    const response = await listRankChecks(
      context("GET", "/keywords/kw_a00000000000000000000000/checks"),
      "kw_a00000000000000000000000",
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.rankCheck.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          keywordId: "keyword_1",
          status: { not: "deferred" },
        }),
      }),
    );
  });

  it("filters rank checks by the persisted running status", async () => {
    const response = await listRankChecks(
      context("GET", "/keywords/kw_a00000000000000000000000/checks?status=running"),
      "kw_a00000000000000000000000",
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.rankCheck.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ keywordId: "keyword_1", status: "running" }),
      }),
    );
  });

  it("starts async rank checks and returns a running rank-check resource", async () => {
    const response = await runRankCheck(
      context("POST", "/keywords/kw_a00000000000000000000000/checks?async=true", {
        provider_id: "serpapi",
      }),
      "kw_a00000000000000000000000",
    );
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toMatchObject({
      id: "check_a00000000000000000000000",
      keyword_id: "kw_a00000000000000000000000",
      provider: "serpapi",
      status: "running",
    });
    expect(mocks.prisma.rankCheck.create).toHaveBeenCalledWith({
      data: {
        attemptCount: 0,
        degradedToCountry: false,
        keywordId: "keyword_1",
        normalizationVersion: null,
        publicId: expect.any(String),
        provider: "serpapi",
        status: "running",
        viaFallback: false,
      },
      select: expect.any(Object),
    });
    expect(mocks.startRankCheckWorkflow).toHaveBeenCalledWith(
      { keywordId: "keyword_1", providerId: "serpapi", rankCheckId: "rank_1" },
      {
        searchAttributes: {
          keywordId: ["keyword_1"],
          projectId: ["project_1"],
          provider: ["serpapi"],
        },
        workflowId: "rank-check-keyword_1-manual",
      },
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "rank_check.requested",
        after: expect.objectContaining({
          keywordId: "kw_a00000000000000000000000",
          provider: "serpapi",
          rankCheckId: "check_a00000000000000000000000",
        }),
        projectId: "project_1",
        targetId: "check_a00000000000000000000000",
        targetType: "rank_check",
      }),
    );
    expect(mocks.runKeywordCheckWithFallback).not.toHaveBeenCalled();
  });

  it("deletes the running row and returns 503 when Temporal cannot start", async () => {
    mocks.startRankCheckWorkflow.mockRejectedValueOnce(new Error("connection refused"));

    const response = await runRankCheck(
      context("POST", "/keywords/kw_a00000000000000000000000/checks?async=true", {}),
      "kw_a00000000000000000000000",
    );

    expect(response.status).toBe(503);
    expect(mocks.prisma.rankCheck.delete).toHaveBeenCalledWith({ where: { id: "rank_1" } });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "rank_check.requested",
        after: expect.objectContaining({
          rankCheckId: "check_a00000000000000000000000",
        }),
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      status: 503,
      title: "Scheduler unavailable",
    });
  });

  it("records failed provider runs through the rank-check failure path", async () => {
    const attempts = [
      { message: "primary timeout", provider: "dataforseo" },
      { message: "backup parse failed", provider: "serpapi" },
    ];
    const error = new mocks.ProviderChainError(attempts);
    mocks.runKeywordCheckWithFallback.mockRejectedValue(error);

    await expect(
      runRankCheck(
        context("POST", "/keywords/kw_a00000000000000000000000/checks", { provider_id: "serpapi" }),
        "kw_a00000000000000000000000",
      ),
    ).rejects.toThrow("All SERP providers failed");
    expect(mocks.persistFailedRankCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        attempts,
        error: error.message,
        keywordId: "keyword_1",
        projectDomain: "example.com",
        provider: "serpapi",
      }),
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "rank_check.run_now",
        after: expect.objectContaining({
          keywordId: "kw_a00000000000000000000000",
          provider: "serpapi",
        }),
        projectId: "project_1",
        status: "failed",
        statusReason: error.message,
        targetId: "kw_a00000000000000000000000",
        targetType: "keyword",
      }),
    );
  });
});
