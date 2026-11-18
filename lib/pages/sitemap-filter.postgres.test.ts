import { loadProjectPagesAction } from "@/lib/actions/pages";
import { exportProjectPagesCsv } from "@/lib/actions/pages-export";
import { Prisma } from "@/lib/generated/prisma/client";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createPagesSitemapFixture } from "./list-sitemap-sql.test-fixture";
import { projectPagesListQuery } from "./list-sql";
import { connectedSources } from "./pages.test-fixture";
import { normalizeStoredSitemapReads, type StoredSitemapRead } from "./sitemap-read-model";
import { latestSitemapReadsQuery } from "./sitemap-sql";

const mocks = vi.hoisted(() => ({ query: vi.fn(), read: vi.fn(), scope: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/activity/app-mutation", () => ({ recordAppAction: vi.fn() }));
vi.mock("@/lib/challenge-report/capture-project-work", () => ({ captureProjectWork: vi.fn() }));
vi.mock("@/lib/pages/sync", () => ({}));
vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: async () => ({ id: "actor" }),
  requireProjectScope: mocks.scope,
  parseActionInput: (schema: { parse: (v: unknown) => unknown }, value: unknown) =>
    schema.parse(value),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    project: { findFirst: async () => ({ id: "project_1", domain: "example.com" }) },
    providerConnection: { findFirst: async () => null },
    $queryRaw: mocks.query,
  },
}));
vi.mock("@/lib/pages/sitemap-read", () => ({ getStoredSitemapRead: mocks.read }));
vi.mock("@/lib/search-insights/sync/credentials", () => ({
  readSearchInsightsConnection: async () => ({ connection: null }),
}));
vi.mock("@/lib/search-insights/sync/sessions-credentials", () => ({
  readOrganicSessionsConnection: async () => ({ connection: null }),
}));
vi.mock("@/lib/conversions/queries", () => ({ getConversionSources: async () => [] }));
vi.mock("@/lib/pages/queries", async (original) => ({
  ...(await original<object>()),
  getProjectPageSources: async () => connectedSources(),
}));

let db: PGlite;
const now = new Date("2026-10-04");
const states = ["no_read", "incomplete", "stale", "disabled", "complete"] as const;
type State = (typeof states)[number];
const filters = ["listed", "not_listed", undefined] as const;
function evidence(state: State): StoredSitemapRead | null {
  return normalizeStoredSitemapReads(
    state === "no_read"
      ? []
      : [
          {
            fetchedAt: new Date(state === "stale" ? "2026-10-01" : "2026-10-03"),
            sitemapUrl: "https://example.com/sitemap.xml",
            complete: state !== "incomplete",
            urlCount: 1,
            entries: [{ loc: "https://example.com/a" }],
          },
        ],
    "example.com",
    state !== "disabled",
    now,
    ["https://example.com/sitemap.xml"],
  );
}
const table = states.flatMap((state) =>
  filters.map((filter) => {
    const checked = state === "incomplete" || state === "complete";
    const status =
      filter && !checked
        ? "sitemap_not_checked"
        : filter === "not_listed" && state === "incomplete"
          ? "sitemap_incomplete"
          : "ok";
    const paths = !filter
      ? ["/a", "/b"]
      : status !== "ok"
        ? []
        : filter === "listed"
          ? ["/a"]
          : ["/b"];
    return { state, filter, checked, status, paths };
  }),
);
const request = (sitemap: (typeof filters)[number]) => ({
  projectId: "prj_1",
  page: 1,
  period: "28",
  dir: "asc",
  sort: "path",
  sitemap,
});
const exportRequest = (sitemap: (typeof filters)[number]) => ({
  ...request(sitemap),
  columns: ["path", "sitemap"],
  window: { from: "2026-10-01T00:00:00.000Z", to: "2026-10-28T00:00:00.000Z" },
});
beforeAll(async () => {
  db = new PGlite({ parsers: { 1114: (value) => new Date(`${value.replace(" ", "T")}Z`) } });
  await db.waitReady;
}, 30000);
afterAll(async () => db.close());
beforeEach(async () => {
  vi.clearAllMocks();
  await createPagesSitemapFixture(db);
  await db.exec(`CREATE TABLE tags (id text, "publicId" text, name text);
    CREATE TABLE page_tags ("pageId" text, "tagId" text);`);
  mocks.scope.mockResolvedValue({ id: "project_1", publicId: "prj_1" });
  mocks.query.mockImplementation(
    async (input: Prisma.Sql | TemplateStringsArray, ...values: unknown[]) => {
      const query = Array.isArray(input)
        ? Prisma.sql(input as TemplateStringsArray, ...values)
        : (input as Prisma.Sql);
      return (await db.query(query.text, query.values)).rows;
    },
  );
});

function queries(
  filter: (typeof filters)[number],
  pageSize = 50,
  read: StoredSitemapRead | null = null,
) {
  return projectPagesListQuery({
    projectId: "project_1",
    host: "example.com",
    from: now,
    to: now,
    page: 1,
    pageSize,
    sessions: "none",
    ga4Property: null,
    gscProperty: null,
    sort: { by: "path", dir: "asc" },
    sitemapRead: read,
    sitemapState: filter,
  });
}

it.each(table)("count: $state / $filter", async ({ state, filter, paths, checked }) => {
  const query = queries(filter, 50, evidence(state));
  const counts = (await db.query(query.counts.text, query.counts.values)).rows[0];
  const rows = (await db.query<{ path: string }>(query.rows.text, query.rows.values)).rows;
  expect(counts).toMatchObject({ all: 2, total: paths.length, sitemapChecked: checked });
  expect(rows.map((row) => row.path)).toEqual(paths);
});

it.each(table)("list: $state / $filter", async ({ state, filter, status, paths }) => {
  mocks.read.mockResolvedValue(evidence(state));
  const list = await loadProjectPagesAction(request(filter));
  expect(list).toMatchObject({ sitemapFilterStatus: status, total: paths.length });
  expect(list.rows.map((row) => row.path)).toEqual(paths);
  expect(mocks.scope).toHaveBeenCalledBefore(mocks.query);
  if (!filter) {
    expect(list.rows.map((row) => row.sitemap.listed)).toEqual(
      state === "complete" ? [true, false] : state === "incomplete" ? [true, null] : [null, null],
    );
  }
});

it.each(table)("export: $state / $filter", async ({ state, filter, status, paths }) => {
  mocks.read.mockResolvedValue(evidence(state));
  const result = await exportProjectPagesCsv(exportRequest(filter));
  expect(result.status).toBe(status);
  expect(mocks.scope).toHaveBeenCalledBefore(mocks.query);
  if (result.status === "ok") {
    expect(result.rows).toBe(paths.length);
    expect(
      result.csv
        .split("\n")
        .slice(1)
        .map((row) => row.split(",")[1]),
    ).toEqual(paths);
    if (!filter && ["no_read", "stale", "disabled"].includes(state)) {
      expect(result.csv.match(/not_checked/g)).toHaveLength(2);
    }
  } else expect(result).toEqual({ status });
});

it.each(filters.slice(0, 2))(
  "retains a mounted %s filter across loss and recovery",
  async (filter) => {
    for (const state of [
      "complete",
      "no_read",
      "incomplete",
      "stale",
      "disabled",
      "complete",
    ] as const) {
      const expected = table.find((row) => row.state === state && row.filter === filter);
      mocks.read.mockResolvedValue(evidence(state));
      const list = await loadProjectPagesAction(request(filter));
      const csv = await exportProjectPagesCsv(exportRequest(filter));
      expect(list.rows.map((row) => row.path)).toEqual(expected?.paths);
      expect(list.total).toBe(expected?.paths.length);
      expect(list.sitemapFilterStatus).toBe(expected?.status);
      expect(csv.status).toBe(expected?.status);
    }
  },
);

it.each(["list", "export"])("authorizes %s before evidence or SQL reads", async (surface) => {
  mocks.scope.mockRejectedValue(new Error("Forbidden"));
  await expect(
    surface === "list"
      ? loadProjectPagesAction(request("listed"))
      : exportProjectPagesCsv(exportRequest("listed")),
  ).rejects.toThrow("Forbidden");
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.query).not.toHaveBeenCalled();
});

it("keeps a mounted negative export narrow across late-page arrival and recovery", async () => {
  await db.exec(`INSERT INTO sitemap_snapshots ("projectId","fetchedAt",entries,complete,"urlCount")
    VALUES ('project_1','2026-10-03','[{"loc":"https://example.com/a"}]',true,1)`);
  const transitions = [
    { sql: "SELECT 1", paths: ["/b"], complete: true },
    {
      sql: `UPDATE project_pages SET "firstSeenAt"='2026-10-04' WHERE id='b'`,
      paths: [],
      complete: false,
    },
    { sql: `UPDATE sitemap_snapshots SET "fetchedAt"='2026-10-04'`, paths: ["/b"], complete: true },
    { sql: `UPDATE sitemap_snapshots SET "fetchedAt"='2026-10-01'`, paths: [], complete: false },
    { sql: `UPDATE sitemap_snapshots SET "fetchedAt"='2026-10-04'`, paths: ["/b"], complete: true },
    { sql: `UPDATE sitemap_snapshots SET complete=false`, paths: [], complete: false },
    { sql: `UPDATE sitemap_snapshots SET complete=true`, paths: ["/b"], complete: true },
  ];
  for (const transition of transitions) {
    await db.exec(transition.sql);
    for (const pageSize of [25, 5001]) {
      const snapshotQuery = latestSitemapReadsQuery("project_1", now);
      const snapshot = (
        await db.query<import("./sitemap-read-model").SitemapReadRow>(
          snapshotQuery.text,
          snapshotQuery.values,
        )
      ).rows;
      const read = normalizeStoredSitemapReads(snapshot, "example.com", true, now, [
        "https://example.com/sitemap.xml",
      ]);
      const query = queries("not_listed", pageSize, read);
      const result = {
        rows: (await db.query<{ path: string }>(query.rows.text, query.rows.values)).rows,
        counts: (await db.query(query.counts.text, query.counts.values)).rows[0],
      };
      expect(result.rows.map((row) => row.path)).toEqual(transition.paths);
      expect(result.counts).toMatchObject({
        total: transition.paths.length,
        sitemapComplete: transition.complete,
      });
    }
  }
});
