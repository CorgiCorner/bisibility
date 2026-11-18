import { dataSyncFixture } from "@/lib/schedules/read-only.test-fixture";
import type { DataSyncKind } from "@/lib/schedules/types";
import { SearchIndexConnectionError } from "@/lib/search-index/errors";
import { beforeEach, expect, it, vi } from "vitest";
import { handleApiRequest } from "./router";
import { dataSyncPublicId } from "./schedule-public-id";
import "./schedule-write-routes";

const projectId = "prj_a00000000000000000000000";
const rankId = "sch_a00000000000000000000000";
const localId = "lmn_a00000000000000000000000";
const path = `projects/${projectId}/schedules`;
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  get: vi.fn(),
  personalScope: vi.fn(),
  preview: vi.fn(),
  setState: vi.fn(),
  update: vi.fn(),
  writeMode: "active",
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
vi.mock("@/lib/schedules/service", () => ({ getSchedule: mocks.get }));
vi.mock("@/lib/schedules/preview", () => ({ previewScheduleChange: mocks.preview }));
vi.mock("@/lib/schedules/mutations", () => ({
  createSchedule: vi.fn(),
  setScheduleState: mocks.setState,
  updateSchedule: mocks.update,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { localMonitor: { findFirst: async () => ({ version: 3 }) } },
}));

function projectAuth(scopes: string[], creatorRole = "admin") {
  return {
    kind: "project_key",
    creatorRole,
    apiKey: { id: "key_1", projectId: "project_1", scopes },
    project: {
      id: "project_1",
      publicId: projectId,
      domain: "example.com",
      ownerId: "user_1",
      writeMode: mocks.writeMode,
    },
  };
}

function personal(role: "viewer" | "member" | "admin") {
  mocks.auth.mockResolvedValue({
    kind: "personal_token",
    token: { id: "token_1", scopes: ["write"] },
    user: { id: `user_${role}` },
  });
  mocks.personalScope.mockResolvedValue({ auth: projectAuth(["write"]), role });
}

function patch(id: string, body: unknown) {
  const route = `${path}/${id}`;
  return handleApiRequest(
    new Request(`https://example.com/api/v1/${route}`, {
      method: "PATCH",
      headers: { Authorization: "Bearer key", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    route.split("/"),
  );
}

function preview(id: string, schedule: unknown) {
  const route = `${path}/preview`;
  return handleApiRequest(
    new Request(`https://example.com/api/v1/${route}`, {
      method: "POST",
      headers: { Authorization: "Bearer key", "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "update", schedule_id: id, schedule }),
    }),
    route.split("/"),
  );
}

const syncId = (kind: DataSyncKind) => dataSyncPublicId(projectId, kind);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.writeMode = "active";
  personal("member");
  mocks.setState.mockResolvedValue({});
  mocks.update.mockResolvedValue({});
  mocks.preview.mockResolvedValue({ requires_review: false });
  mocks.get.mockImplementation(async (_project: string, id: string) => {
    const sync = /^sync:prj_[a-z0-9]+:(\w+)$/.exec(id)?.[1] as DataSyncKind | undefined;
    if (sync) return { ...dataSyncFixture(sync), id };
    const kind = id === localId ? "local_monitor" : "rank";
    return {
      ...dataSyncFixture("domain_rating"),
      id,
      kind,
      group: "checks",
      cadence: { frequency: "daily", cron_expression: null, timezone: "UTC" },
      rank: { jitterMinutes: 60 },
    };
  });
});

it("refuses a member's rank archive and its preview, and lets an admin archive", async () => {
  expect((await patch(rankId, { state: "archived" })).status).toBe(403);
  expect((await preview(rankId, { state: "archived" })).status).toBe(403);
  expect(mocks.setState).not.toHaveBeenCalled();
  expect(mocks.preview).not.toHaveBeenCalled();

  personal("admin");
  expect((await patch(rankId, { state: "archived" })).status).toBe(200);
  expect(mocks.setState).toHaveBeenCalledWith(
    "project_1",
    expect.objectContaining({ id: "user_admin" }),
    rankId,
    "archived",
    { kind: "rank", projectPublicId: projectId },
    expect.objectContaining({ atomic: true, gate: true }),
  );
});

it("lets a member pause a rank schedule and edit its name", async () => {
  expect((await patch(rankId, { state: "paused" })).status).toBe(200);
  expect(mocks.setState).toHaveBeenCalledTimes(1);
  expect((await patch(rankId, { kind: "rank", name: "Weekly" })).status).toBe(200);
  expect(mocks.update).toHaveBeenCalledWith(
    "project_1",
    expect.objectContaining({ id: "user_member" }),
    rankId,
    { kind: "rank", input: expect.objectContaining({ name: "Weekly", scheduleId: rankId }) },
    expect.objectContaining({ atomic: true }),
  );
});

it("refuses a viewer's rank pause", async () => {
  personal("viewer");
  expect((await patch(rankId, { state: "paused" })).status).toBe(403);
  expect(mocks.setState).not.toHaveBeenCalled();
});

it.each([
  ["domain_rating", false],
  ["sitemap", true],
  ["search_console", true],
  ["page_indexing", true],
] as const)("applies the %s control to a member's pause", async (kind, allowed) => {
  expect((await patch(syncId(kind), { state: "paused" })).status).toBe(allowed ? 200 : 403);
  expect(mocks.setState).toHaveBeenCalledTimes(allowed ? 1 : 0);
  if (allowed)
    expect(mocks.setState.mock.calls[0][4]).toEqual({
      kind: "data_sync",
      projectPublicId: projectId,
      publicWrite: true,
      auditActorId: "user_member",
      syncKind: kind,
    });
});

it("pauses a local monitor at its current version for a member", async () => {
  expect((await patch(localId, { state: "paused" })).status).toBe(200);
  expect(mocks.setState.mock.calls[0][4]).toEqual({
    kind: "local_monitor",
    projectPublicId: projectId,
    local: {
      expectedVersion: 3,
      idempotencyKey: `schedule-${localId}-3-paused`,
      monitorId: localId,
      projectId,
    },
  });
});

it.each([
  ["admin", ["write"], 403],
  ["member", ["admin"], 403],
  ["admin", ["admin"], 200],
] as const)(
  "checks a rank archive through a key of a %s creator with %s scope",
  async (creatorRole, scopes, status) => {
    mocks.auth.mockResolvedValue(projectAuth([...scopes], creatorRole));
    expect((await patch(rankId, { state: "archived" })).status).toBe(status);
    expect(mocks.setState).toHaveBeenCalledTimes(status === 200 ? 1 : 0);
  },
);

it("keeps member-level changes open to a write-scoped key", async () => {
  mocks.auth.mockResolvedValue(projectAuth(["write"], "member"));
  expect((await patch(rankId, { state: "paused" })).status).toBe(200);
  expect((await patch(syncId("sitemap"), { state: "paused" })).status).toBe(200);
  expect(mocks.setState).toHaveBeenCalledTimes(2);
});

it("refuses schedule writes on a read-only (migration hold) project and still previews", async () => {
  mocks.writeMode = "migration_hold";
  mocks.auth.mockResolvedValue(projectAuth(["admin"]));
  const response = await patch(rankId, { state: "paused" });
  expect(response.status).toBe(423);
  expect(await response.json()).toMatchObject({ status: 423, title: "Project read-only" });
  expect(mocks.setState).not.toHaveBeenCalled();
  expect((await preview(rankId, { state: "paused" })).status).toBe(200);
});

it("answers 409 when page indexing has no connected Search Console property", async () => {
  mocks.setState.mockRejectedValue(new SearchIndexConnectionError());
  const response = await patch(syncId("page_indexing"), { state: "active" });
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
    code: "data_sync_connection_required",
    title: "Data sync connection required",
  });
});
