import { scheduleCostTotal } from "@/lib/schedules/cost-total";
import { aiFixture, priceNow, rankFixture } from "@/lib/schedules/list.test-fixture";
import { dataSyncFixture, localScheduleFixture } from "@/lib/schedules/read-only.test-fixture";
import { listSchedules } from "@/lib/schedules/service";
import { beforeEach, expect, it, vi } from "vitest";
import { ApiAuthError } from "./auth";
import { handleApiRequest } from "./router";
import { scheduleKinds } from "./schedules-input";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), rank: vi.fn(), local: vi.fn(), sync: vi.fn() }));
vi.mock("./router", async (importOriginal) =>
  (await import("./response-capture.test-support")).captureRouter(await importOriginal()),
);
vi.mock("./auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./auth")>()),
  authenticateBearer: mocks.auth,
}));
vi.mock("./ratelimit", () => ({
  checkRateLimit: async () => ({ headers: new Headers(), success: true }),
  rateLimitExceeded: vi.fn(),
}));
vi.mock("@/lib/queries/check-schedule-list", () => ({ listCheckScheduleRows: mocks.rank }));
vi.mock("@/lib/schedules/checks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/schedules/checks")>()),
  listAiScheduleRows: async (_projectId: string, status: string) =>
    status === "current" ? [ai] : [],
}));
vi.mock("@/lib/schedules/local-monitors", () => ({ listLocalMonitorSchedules: mocks.local }));
vi.mock("@/lib/schedules/data-syncs", () => ({ listDataSyncSchedules: mocks.sync }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    rankCheckRun: { findMany: async () => [] },
    aiTrackingRun: { findMany: async () => [] },
    aiPrompt: { findMany: async () => ai.promptIds.map((publicId) => ({ publicId })) },
  },
}));

const projectId = "prj_a00000000000000000000000";
const otherProject = "prj_b00000000000000000000000";
const rankId = "sch_a00000000000000000000000";
const archivedId = "sch_b00000000000000000000000";
const ai = {
  ...aiFixture,
  id: "ais_a00000000000000000000000",
  promptIds: ["aip_a00000000000000000000000", "aip_b00000000000000000000000"],
};
function auth(scopes = ["read"]) {
  return {
    kind: "project_key",
    creatorRole: "owner",
    apiKey: { id: "key_1", projectId: "project_1", scopes },
    project: {
      id: "project_1",
      publicId: projectId,
      domain: "example.com",
      ownerId: "user_1",
      writeMode: "read_only",
    },
  };
}
async function request(suffix = "", project = projectId) {
  const path = `projects/${project}/schedules${suffix}`;
  return handleApiRequest(
    new Request(`https://example.com/api/v1/${path}`),
    path.split("?")[0].split("/"),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(priceNow);
  mocks.auth.mockResolvedValue(auth());
  mocks.rank.mockImplementation(async (project: string, status: string) =>
    project === "project_1"
      ? [
          {
            ...rankFixture,
            publicId: status === "archived" ? archivedId : rankId,
            archivedAt: status === "archived" ? priceNow.toISOString() : null,
            perRunCents: 1,
            nativeEstimate: {
              providerId: "dataforseo",
              unit: "cents",
              quantity: 0.12,
              unknownTargets: 0,
            },
          },
        ]
      : [],
  );
  mocks.local.mockImplementation(async (_project: string, status: string) =>
    status === "current"
      ? [
          {
            ...localScheduleFixture,
            id: "lmn_a00000000000000000000000",
            target: { type: "monitor", ids: ["lmn_a00000000000000000000000"] },
          },
        ]
      : [],
  );
  mocks.sync.mockResolvedValue(
    ["domain_rating", "sitemap", "search_console", "page_indexing"].map((kind) => ({
      ...dataSyncFixture(kind as Parameters<typeof dataSyncFixture>[0]),
      id: `sync:${projectId}:${kind}`,
    })),
  );
});

it("lists all seven public kinds with read scope in a read-only project", async () => {
  const response = await request();
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.data.map((row: { kind: string }) => row.kind).sort()).toEqual(
    [...scheduleKinds].sort(),
  );
  expect(body.meta.next_cursor).toBeNull();
  const rank = body.data.find((row: { id: string }) => row.id === rankId);
  expect(rank).toMatchObject({
    group: "tracking",
    actions: ["read"],
    last_run_status: null,
    cadence: { time_of_day: "06:00", jitter_minutes: 15 },
    monthly_cost_estimate_cents: 3.6,
  });
  for (const row of body.data) {
    expect(row).not.toHaveProperty("rank");
    expect(row).not.toHaveProperty("ai");
    expect(row).not.toHaveProperty("sync_kind");
    expect(row).not.toHaveProperty("last_run_state");
  }
  expect(mocks.rank).toHaveBeenCalledWith("project_1", "current");
});

it("keeps API totals identical to the web service and active-total aggregation", async () => {
  const webRows = await listSchedules("project_1", { status: "current", ai: [ai] });
  const body = await (await request()).json();
  expect(
    scheduleCostTotal(body.data.filter((row: { group: string }) => row.group === "tracking")),
  ).toEqual(scheduleCostTotal(webRows));
  expect(
    scheduleCostTotal(body.data.filter((row: { group: string }) => row.group === "tracking")),
  ).toEqual({ cents: 299.6, unknown: 0 });
  expect(
    body.data
      .map((row: { monthly_cost_estimate_cents: number | null }) => row.monthly_cost_estimate_cents)
      .sort(),
  ).toEqual(webRows.map((row) => row.monthly_cost_estimate_cents).sort());
});

it.each(scheduleKinds)("filters kind %s", async (kind) => {
  const body = await (await request(`?kind=${kind}`)).json();
  expect(body.data).toHaveLength(1);
  expect(body.data[0].kind).toBe(kind);
});

it("filters state and applies both filters before pagination", async () => {
  mocks.local.mockResolvedValue([
    { ...localScheduleFixture, id: "lmn_a00000000000000000000000", state: "paused" },
  ]);
  expect(
    (await (await request("?state=paused&kind=local_monitor&limit=1")).json()).data,
  ).toMatchObject([{ kind: "local_monitor", state: "paused" }]);
  expect((await (await request("?state=active&kind=local_monitor")).json()).data).toEqual([]);
  const archived = await (await request("?state=archived")).json();
  expect(archived.data).toMatchObject([{ id: archivedId, state: "archived" }]);
});

it("paginates with v3 cursors without losing or repeating schedules", async () => {
  const first = await (await request("?limit=3")).json();
  const second = await (await request(`?limit=3&cursor=${first.meta.next_cursor}`)).json();
  const third = await (await request(`?limit=3&cursor=${second.meta.next_cursor}`)).json();
  const all = [...first.data, ...second.data, ...third.data];
  expect(new Set(all.map((row) => row.id)).size).toBe(7);
  expect(all).toHaveLength(7);
  expect(third.meta.next_cursor).toBeNull();
});

it("gets current and archived schedules", async () => {
  for (const id of [rankId, archivedId]) {
    const response = await request(`/${id}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id });
  }
});

it("round-trips a stable dsy_ ID for every data sync kind", async () => {
  const first = await (await request()).json();
  const second = await (await request()).json();
  const syncs = first.data.filter((row: { group: string }) => row.group === "data_sync");
  expect(syncs.map((row: { kind: string }) => row.kind).sort()).toEqual([
    "domain_rating",
    "page_indexing",
    "search_console_import",
    "sitemap_fetch",
  ]);
  for (const row of syncs) {
    expect(row.id).toMatch(/^dsy_[a-z][a-z0-9]{23}$/);
    expect(row.id).not.toContain(projectId);
    expect(row.id).not.toContain("project_1");
    expect(row.id).not.toContain("sync:");
  }
  expect(new Set(syncs.map((row: { id: string }) => row.id)).size).toBe(4);
  expect(syncs.map((row: { id: string }) => row.id)).toEqual(
    second.data
      .filter((row: { group: string }) => row.group === "data_sync")
      .map((row: { id: string }) => row.id),
  );
  for (const row of syncs) {
    const response = await request(`/${row.id}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: row.id, kind: row.kind });
  }
  expect(JSON.stringify(first)).not.toContain("sync:");
});

it.each(["", `/${rankId}`])("refuses missing auth and read scope for %s", async (suffix) => {
  mocks.auth.mockRejectedValueOnce(new ApiAuthError("Missing bearer token."));
  expect((await request(suffix)).status).toBe(401);
  mocks.auth.mockResolvedValueOnce(auth([]));
  expect((await request(suffix)).status).toBe(403);
  expect(mocks.rank).not.toHaveBeenCalled();
});

it.each(["", `/${rankId}`])("returns 404 for a different project path %s", async (suffix) => {
  expect((await request(suffix, otherProject)).status).toBe(404);
  expect(mocks.rank).not.toHaveBeenCalled();
});

it("does not find another project's schedule through this project", async () => {
  expect((await request("/sch_c00000000000000000000000")).status).toBe(404);
  expect((await request("/dsy_b00000000000000000000000")).status).toBe(404);
  expect(mocks.rank.mock.calls.every(([project]) => project === "project_1")).toBe(true);
});

it("rejects the internal sync form on the public route", async () => {
  for (const kind of ["domain_rating", "sitemap", "search_console", "page_indexing"]) {
    expect((await request(`/sync:${projectId}:${kind}`)).status).toBe(400);
  }
  expect(mocks.rank).not.toHaveBeenCalled();
  expect(mocks.sync).not.toHaveBeenCalled();
});

it.each([
  "kind=unknown",
  "kind=data_sync",
  "state=current",
  "state=unknown",
  "limit=0",
  "limit=201",
  "limit=bad",
  "cursor=bad",
])("rejects invalid filters or pagination %s", async (query) => {
  expect((await request(`?${query}`)).status).toBe(400);
});
it.each([
  "internal_id",
  "sch_short",
  "sync:internal:sitemap",
  `sync:${projectId}:unknown`,
  `sync:${projectId}:sitemap`,
])("refuses non-public schedule ID %s", async (id) => {
  expect((await request(`/${id}`)).status).toBe(400);
  expect(mocks.rank).not.toHaveBeenCalled();
});
it("refuses to serialize internal schedule identifiers", async () => {
  mocks.rank.mockResolvedValue([{ ...rankFixture, publicId: "internal_id" }]);
  expect((await request()).status).toBe(400);
});
it("validates public project IDs before reading", async () => {
  expect((await request("", "internal_project")).status).toBe(400);
  expect(mocks.rank).not.toHaveBeenCalled();
});
