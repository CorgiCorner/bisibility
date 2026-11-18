import {
  catalog,
  columnId,
  input,
  result,
  unknownMoney,
} from "@/lib/model-playground/contract-fixtures.test-support";
import { beforeEach, vi } from "vitest";
import { resetIdempotencyForTests } from "./idempotency";
import { resetRateLimitStateForTests } from "./ratelimit";
import { handleMcpPreauthenticatedApiRequest } from "./router";
import { snakeizeKeys } from "./surface";

const mocks = vi.hoisted(() => ({
  project: { findUnique: vi.fn() },
  redis: {
    getRedisClient: vi.fn(),
    redisConfigured: vi.fn(() => false),
    resetRedisClientForTests: vi.fn(),
  },
  service: {
    enabled: true,
    checkConnection: vi.fn(),
    catalog: vi.fn(),
    estimate: vi.fn(),
    preview: vi.fn(),
    create: vi.fn(),
    read: vi.fn(),
  },
}));
vi.mock("./model-playground-service", () => ({ getModelPlaygroundService: () => mocks.service }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { project: mocks.project } }));
vi.mock("@/lib/redis/redis", () => mocks.redis);
vi.mock("@/lib/observability/request-failure", () => ({ reportRequestFailure: vi.fn() }));
const projectId = "prj_a00000000000000000000000";
const quoteId = "019a70b2-0000-7000-8000-000000000002";
const runId = "019a70b2-0000-7000-8000-000000000003";
const attemptId = `model:${quoteId}:${columnId}`;
const auth = {
  kind: "project_key" as const,
  creatorRole: "owner" as const,
  apiKey: { id: "fixture-api-key", projectId: "project-internal", scopes: ["read", "write"] },
  project: {
    id: "project-internal",
    publicId: projectId,
    ownerId: "fixture-owner",
    writeMode: "writable",
  },
};
const admitted = {
  kind: "admitted",
  quoteId,
  runId,
  columnAttempts: { [columnId]: attemptId },
  attempts: [{ id: attemptId, columnId, state: "admitted" }],
  replayed: false,
  earlierAttemptUnconfirmed: false,
};
const createBody = { version: 1, quoteId, consent: "non_guaranteed_estimate_v1" };
async function request(
  method: string,
  tail: string,
  body?: unknown,
  key?: string,
  currentAuth = auth,
) {
  const url = new URL(`https://example.com/api/v1/projects/${projectId}/model-playground/${tail}`);
  return handleMcpPreauthenticatedApiRequest(
    new Request(url, {
      method,
      headers: { "content-type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(snakeizeKeys(body)) }),
    }),
    url.pathname.replace("/api/v1/", "").split("/"),
    { auth: currentAuth as never },
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.service.enabled = true;
  mocks.redis.getRedisClient.mockResolvedValue(null);
  mocks.redis.redisConfigured.mockReturnValue(false);
  mocks.project.findUnique.mockResolvedValue({
    ...auth.project,
    domain: "example.com",
    name: "Fixture",
  });
  resetIdempotencyForTests();
  resetRateLimitStateForTests();
  mocks.service.checkConnection.mockResolvedValue({ kind: "ready" });
  const { accountDigest: _digest, ...safeCatalog } = catalog();
  mocks.service.catalog.mockResolvedValue(safeCatalog);
  mocks.service.preview.mockResolvedValue({
    version: 1,
    quoteId,
    expiresAt: "2026-11-13T12:10:00Z",
    forecasts: [{ columnId, money: unknownMoney, complete: false }],
  });
  mocks.service.estimate.mockResolvedValue({
    version: 1,
    estimatedAt: "2026-11-13T12:00:00Z",
    budgetAvailable: true,
    forecasts: [{ columnId, money: unknownMoney, complete: false }],
  });
  mocks.service.create.mockResolvedValue(admitted);
  const answer = result();
  answer.consultedSources = { total: null, omitted: null, truncated: false, sources: [] };
  answer.citationTotals = { total: 2, omitted: 0 };
  answer.costEvidence = { providerReported: null, upstreamInference: null, localEstimate: null };
  answer.routingAttemptCredentials = { version: 1, completeness: "unknown", attempts: [] };
  mocks.service.read.mockResolvedValue({
    version: 1,
    runId,
    projectId,
    reportId: null,
    prompt: input().prompt,
    responseLanguage: "en",
    columns: [
      {
        column: answer.column,
        state: "completed",
        attemptId,
        attemptState: "observed",
        result: answer,
      },
    ],
  });
});

export { admitted, attemptId, auth, createBody, mocks, projectId, quoteId, request, runId };
