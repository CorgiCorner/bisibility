import { dataSyncFixture } from "@/lib/schedules/read-only.test-fixture";
import { beforeEach, expect, it, vi } from "vitest";
import { handleApiRequest } from "./router";
import { dataSyncPublicId } from "./schedule-public-id";
import "./schedule-write-routes";

const projectId = "prj_a00000000000000000000000";
const otherProjectId = "prj_b00000000000000000000000";
const id = dataSyncPublicId(projectId, "domain_rating");
const rankId = "sch_a00000000000000000000000";
const keywordId = "kw_a00000000000000000000000";
const path = `projects/${projectId}/schedules`;
const create = { kind: "rank", name: "Weekly checks", cadence: { frequency: "manual" } };
const update = { state: "active" };
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  project: vi.fn(),
  setEnabled: vi.fn(),
  receipt: vi.fn(),
  keyword: vi.fn(),
  rank: vi.fn(),
  assign: vi.fn(),
  cadence: vi.fn(),
  personalScope: vi.fn(),
}));

vi.mock("./router", async (original) =>
  (await import("./response-capture.test-support")).captureRouter(await original()),
);
vi.mock("./auth", async (original) => ({
  ...(await original<typeof import("./auth")>()),
  authenticateBearer: mocks.auth,
}));
vi.mock("./personal-scope", () => ({ resolvePersonalProjectScope: mocks.personalScope }));
vi.mock("./ratelimit", () => ({
  checkRateLimit: async () => ({ headers: new Headers(), success: true }),
}));
vi.mock("./idempotency", () => ({
  withIdempotency: (_ctx: unknown, execute: () => Promise<Response>) => execute(),
}));
vi.mock("@/lib/auth/audit", () => ({
  writeAudit: vi.fn(),
  writeAuditFailure: vi.fn(async () => undefined),
  withProjectKeyAudit: (_attribution: unknown, run: () => Promise<unknown>) => run(),
}));
vi.mock("@/lib/providers/crypto", async (original) => ({
  ...(await original<typeof import("@/lib/providers/crypto")>()),
  getPurposeSecretKeys: () => [Buffer.from("synthetic-schedule-review-key-0123456789")],
}));
vi.mock("@/lib/schedules/service", () => ({ getSchedule: mocks.get }));
vi.mock("@/lib/rank-check/schedules/service", () => ({ createSchedule: mocks.create }));
vi.mock("@/lib/rank-check/schedules/service-membership", async (original) => ({
  ...(await original<typeof import("@/lib/rank-check/schedules/service-membership")>()),
  assignKeywordsToSchedule: mocks.assign,
}));
vi.mock("@/lib/rank-check/schedules/keyword-cadence", () => ({
  setKeywordCadence: mocks.cadence,
}));
vi.mock("@/lib/db/prisma", () => {
  const db = {
    $queryRaw: async () => [],
    project: {
      findFirst: mocks.project,
      findUniqueOrThrow: mocks.project,
      update: mocks.setEnabled,
    },
    projectDefaults: { findUnique: async () => null },
    projectSyncPause: { create: async () => ({}), deleteMany: async () => ({ count: 1 }) },
    providerConnection: { findFirst: async () => null },
    keyword: { findMany: mocks.keyword },
    checkSchedule: { findFirst: mocks.rank },
    scheduleReviewReceipt: { create: mocks.receipt, findMany: async () => [] },
  };
  return { prisma: { ...db, $transaction: (run: (tx: typeof db) => unknown) => run(db) } };
});

function auth(scopes: string[], creatorRole = "admin") {
  return {
    kind: "project_key",
    creatorRole,
    apiKey: { id: "key_1", projectId: "project_1", scopes },
    project: {
      id: "project_1",
      publicId: projectId,
      domain: "example.com",
      ownerId: "user_1",
      writeMode: "active",
    },
  };
}

function call(method: string, route: string, body: unknown) {
  return handleApiRequest(
    new Request(`https://example.com/api/v1/${route}`, {
      method,
      headers: { Authorization: "Bearer key", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    route.split("/"),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  let enabled = false;
  mocks.auth.mockResolvedValue(auth(["write"]));
  mocks.project.mockImplementation(async () => ({
    id: "project_1",
    publicId: projectId,
    domainRatingEnabled: enabled,
    syncPauses: enabled ? [] : [{ kind: "domain_rating" }],
    writeMode: "active",
  }));
  mocks.setEnabled.mockImplementation(async (args) => {
    enabled = args.data.domainRatingEnabled;
  });
  mocks.create.mockResolvedValue({ publicId: rankId });
  mocks.keyword.mockResolvedValue([]);
  mocks.rank.mockResolvedValue(null);
  mocks.get.mockImplementation(async (_project: string, scheduleId: string) => {
    if (scheduleId === rankId)
      return {
        ...dataSyncFixture("domain_rating"),
        id: rankId,
        group: "checks",
        kind: "rank",
        cadence: { frequency: "manual", cron_expression: null, timezone: "UTC" },
        target: { type: "keywords" },
        name: create.name,
        rank: { jitterMinutes: 60 },
      };
    return scheduleId === `sync:${projectId}:domain_rating`
      ? {
          ...dataSyncFixture("domain_rating"),
          id: scheduleId,
          state: enabled ? "active" : "paused",
        }
      : null;
  });
});

it.each([
  ["POST", path, create],
  ["POST", `${path}/preview`, { operation: "create", schedule: create }],
  ["PATCH", `${path}/${id}`, update],
  [
    "POST",
    "keywords/bulk",
    { operation: "set_schedule", keyword_ids: [keywordId], schedule_id: rankId },
  ],
])("requires write scope for %s %s", async (method, route, body) => {
  mocks.auth.mockResolvedValue(auth(["read"]));
  expect((await call(method, route, body)).status).toBe(403);
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.get).not.toHaveBeenCalled();
});

it("scopes previews, creates, schedule IDs and keyword assignments to the project", async () => {
  const wrongPath = `projects/${otherProjectId}/schedules`;
  expect((await call("POST", wrongPath, create)).status).toBe(404);
  expect(
    (await call("POST", `${wrongPath}/preview`, { operation: "create", schedule: create })).status,
  ).toBe(404);
  const foreignId = dataSyncPublicId(otherProjectId, "domain_rating");
  expect((await call("PATCH", `${path}/${foreignId}`, update)).status).toBe(404);
  expect(
    (
      await call("POST", "keywords/bulk", {
        operation: "set_schedule",
        keyword_ids: [keywordId],
        schedule_id: rankId,
      })
    ).status,
  ).toBe(404);
  expect(mocks.get).not.toHaveBeenCalled();
});

it("rejects a PATCH whose project path does not match the credential", async () => {
  const wrongPath = `projects/${otherProjectId}/schedules/${id}`;
  expect((await call("PATCH", wrongPath, update)).status).toBe(404);
  expect(mocks.get).not.toHaveBeenCalled();
});

it("creates a rank schedule and refuses data sync creation or edits to sync properties", async () => {
  expect((await call("POST", path, create)).status).toBe(201);
  const response = await call("POST", path, { kind: "domain_rating" });
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ code: "schedule_create_unsupported" });
  const patch = await call("PATCH", `${path}/${id}`, { kind: "rank", name: "Custom" });
  expect(patch.status).toBe(400);
  expect(await patch.json()).toMatchObject({ code: "data_sync_state_only" });
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(mocks.setEnabled).not.toHaveBeenCalled();
});

it("previews, refuses an increase without review, accepts a fresh review and refuses replay", async () => {
  mocks.auth.mockResolvedValue(auth(["admin"]));
  const preview = await call("POST", `${path}/preview`, {
    operation: "update",
    schedule_id: id,
    schedule: update,
  });
  expect(preview.status).toBe(200);
  const { expected_revision, preview_token, window_start, requires_review } = await preview.json();
  expect(requires_review).toBe(true);
  expect(preview_token).toEqual(expect.any(String));
  const review = { expected_revision, preview_token, window_start };
  const missing = await call("PATCH", `${path}/${id}`, update);
  expect(missing.status).toBe(428);
  expect(await missing.json()).toMatchObject({ code: "schedule_review_required" });
  expect(mocks.setEnabled).not.toHaveBeenCalled();

  const stale = await call("PATCH", `${path}/${id}`, {
    ...update,
    review: { ...review, expected_revision: "1" },
  });
  expect(stale.status).toBe(409);
  expect(await stale.json()).toMatchObject({ code: "schedule_review_stale" });
  expect(mocks.receipt).not.toHaveBeenCalled();

  const allowed = await call("PATCH", `${path}/${id}`, { ...update, review });
  expect(allowed.status).toBe(200);
  expect(await allowed.json()).toMatchObject({ id, state: "active" });
  expect(mocks.receipt).toHaveBeenCalledTimes(1);
  expect((await call("PATCH", `${path}/${id}`, { ...update, review })).status).toBe(409);
  expect(mocks.receipt).toHaveBeenCalledTimes(1);
  expect((await call("PATCH", `${path}/${id}`, { state: "paused" })).status).toBe(200);
  expect(mocks.receipt).toHaveBeenCalledTimes(1);
});

it("assigns a keyword with a signed review and moves it to Manual without one", async () => {
  const target = {
    publicId: rankId,
    measurementEpoch: 0n,
    updatedAt: new Date("2026-11-17T00:00:00.000Z"),
    frequency: "monthly",
    cronExpression: null,
    timezone: "UTC",
    timeOfDay: null,
    jitterMinutes: 60,
    serpDepth: 20,
    providerPolicy: "dataforseo",
    archivedAt: null,
    enabled: true,
  };
  const keyword = {
    id: "keyword-db",
    publicId: keywordId,
    measurementTargetEpoch: 0n,
    checkScheduleId: null as string | null,
    checkSchedule: null as typeof target | null,
  };
  mocks.rank.mockResolvedValue(target);
  mocks.keyword.mockImplementation(async () => [{ ...keyword }]);
  mocks.assign.mockImplementation(async () => {
    keyword.checkScheduleId = "schedule-db";
    keyword.checkSchedule = target;
  });
  const change = { operation: "set_schedule", keyword_ids: [keywordId], schedule_id: rankId };
  const preview = await call("POST", `${path}/preview`, change);
  expect(preview.status).toBe(200);
  const { expected_revision, preview_token, window_start } = await preview.json();
  expect(preview_token).toEqual(expect.any(String));

  expect((await call("POST", "keywords/bulk", change)).status).toBe(428);
  expect(mocks.assign).not.toHaveBeenCalled();
  const review = { expected_revision, preview_token, window_start };
  expect(
    (
      await call("POST", "keywords/bulk", {
        ...change,
        review: { ...review, expected_revision: "1" },
      })
    ).status,
  ).toBe(409);
  const saved = await call("POST", "keywords/bulk", { ...change, review });
  expect(saved.status).toBe(200);
  expect(await saved.json()).toEqual({
    operation: "set_schedule",
    results: [{ keyword_id: keywordId, status: "updated" }],
  });
  expect(mocks.assign).toHaveBeenCalledTimes(1);
  expect(mocks.receipt).toHaveBeenCalledTimes(1);
  expect((await call("POST", "keywords/bulk", { ...change, review })).status).toBe(409);
  expect((await call("POST", "keywords/bulk", { ...change, schedule_id: null })).status).toBe(200);
  expect(mocks.cadence).toHaveBeenCalledTimes(1);
  expect(mocks.receipt).toHaveBeenCalledTimes(1);
});

it("pauses a paid data sync without requiring a receipt", async () => {
  mocks.auth.mockResolvedValue(auth(["admin"]));
  mocks.project.mockResolvedValue({
    id: "project_1",
    publicId: projectId,
    domainRatingEnabled: true,
    syncPauses: [],
    writeMode: "active",
  });
  const response = await call("PATCH", `${path}/${id}`, { state: "paused" });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ id, state: "paused" });
  expect(mocks.setEnabled).toHaveBeenCalledTimes(1);
  expect(mocks.receipt).not.toHaveBeenCalled();
});

function personal(role: "member" | "admin") {
  mocks.auth.mockResolvedValue({
    kind: "personal_token",
    token: { id: "token_1", scopes: ["write"] },
    user: { id: `user_${role}` },
  });
  mocks.personalScope.mockResolvedValue({ auth: auth(["write"]), role });
}

it("refuses a member's Domain Rating pause and preview with 403 and lets an admin pause", async () => {
  mocks.project.mockResolvedValue({
    id: "project_1",
    publicId: projectId,
    domainRatingEnabled: true,
    syncPauses: [],
    writeMode: "active",
  });
  personal("member");
  const pause = await call("PATCH", `${path}/${id}`, { state: "paused" });
  expect(pause.status).toBe(403);
  const preview = await call("POST", `${path}/preview`, {
    operation: "update",
    schedule_id: id,
    schedule: { state: "paused" },
  });
  expect(preview.status).toBe(403);
  expect(mocks.setEnabled).not.toHaveBeenCalled();

  personal("admin");
  const allowed = await call("PATCH", `${path}/${id}`, { state: "paused" });
  expect(allowed.status).toBe(200);
  expect(mocks.setEnabled).toHaveBeenCalledWith({
    data: { domainRatingEnabled: false },
    where: { id: "project_1" },
  });
});
