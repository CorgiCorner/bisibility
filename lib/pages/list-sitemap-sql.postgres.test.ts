import type { Prisma } from "@/lib/generated/prisma/client";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPagesSitemapFixture } from "./list-sitemap-sql.test-fixture";
import { type ProjectPagesQueryInput, projectPagesListQuery } from "./list-sql";
import { normalizeStoredSitemapReads, type StoredSitemapRead } from "./sitemap-read-model";
import { latestSitemapReadsQuery, pageSitemapMembershipQuery } from "./sitemap-sql";

let db: PGlite;
async function execute<T>(sql: Prisma.Sql) {
  return (await db.query<T>(sql.text, sql.values)).rows;
}
function queries(
  sitemapState?: "listed" | "not_listed",
  pageSize = 100,
  sitemapRead: StoredSitemapRead | null = null,
  overrides: Partial<ProjectPagesQueryInput> = {},
) {
  return projectPagesListQuery({
    from: new Date("2026-10-01"),
    to: new Date("2026-10-31"),
    host: "example.com",
    projectId: "project_1",
    ga4Property: null,
    gscProperty: null,
    sessions: "none",
    page: 1,
    pageSize,
    sort: { by: "path", dir: "asc" },
    sitemapState,
    sitemapRead,
    ...overrides,
  });
}
async function read(
  sitemapState?: "listed" | "not_listed",
  overrides: Partial<ProjectPagesQueryInput> = {},
) {
  const snapshot = await execute<import("./sitemap-read-model").SitemapReadRow>(
    latestSitemapReadsQuery("project_1", new Date("2026-10-04")),
  );
  const query = queries(
    sitemapState,
    100,
    normalizeStoredSitemapReads(snapshot, "example.com", true, new Date("2026-10-04"), [
      "https://example.com/sitemap.xml",
    ]),
    overrides,
  );
  return {
    counts: (await execute<Record<string, unknown>>(query.counts))[0],
    rows: await execute<{ path: string; listed: boolean | null; statusKind: string | null }>(
      query.rows,
    ),
  };
}
beforeAll(async () => {
  db = new PGlite({ parsers: { 1114: (value) => new Date(`${value.replace(" ", "T")}Z`) } });
  await db.waitReady;
}, 30000);
afterAll(async () => {
  await db.close();
});
beforeEach(() => createPagesSitemapFixture(db));

describe("sitemap membership SQL (offline PostgreSQL)", () => {
  it("does not turn an unread sitemap into two negative memberships", async () => {
    const { counts, rows } = await read();
    expect(counts).toMatchObject({
      all: 2,
      listed: 0,
      notListed: null,
      total: 2,
      sitemapChecked: false,
    });
    expect(rows.map((row) => row.listed)).toEqual([null, null]);
  });
  it.each(["listed", "not_listed"] as const)(
    "keeps the %s filter empty until a sitemap is read",
    async (state) => {
      const { counts, rows } = await read(state);
      expect(counts?.total).toBe(0);
      expect(rows).toEqual([]);
    },
  );
  it("counts and filters true positives and true negatives after a read", async () => {
    await db.exec(
      `INSERT INTO project_page_sources VALUES ('a','sitemap','2026-10-02','2026-10-02','{"listed":true}');
      INSERT INTO sitemap_snapshots ("projectId", "fetchedAt", entries,complete,"urlCount") VALUES ('project_1','2026-10-03','[{"loc":"https://example.com/a"}]',true,1);`,
    );
    expect((await read()).counts).toMatchObject({
      all: 2,
      listed: 1,
      notListed: 1,
      sitemapChecked: true,
    });
    expect((await read()).rows.map((row) => row.listed)).toEqual([true, false]);
    expect((await read("listed")).rows.map((row) => row.path)).toEqual(["/a"]);
    expect((await read("not_listed")).rows.map((row) => row.path)).toEqual(["/b"]);
    expect((await read("listed")).counts).toMatchObject({ listed: 1, notListed: 1, total: 1 });
  });
  it("recognizes an empty read without a per-page source, scoped to this project", async () => {
    await db.exec(
      `INSERT INTO sitemap_snapshots ("projectId", "fetchedAt",complete,"urlCount") VALUES ('other','2026-10-03',true,0);`,
    );
    expect((await read()).rows[0]?.listed).toBeNull();
    await db.exec(
      `INSERT INTO sitemap_snapshots ("projectId", "fetchedAt",complete,"urlCount") VALUES ('project_1','2026-10-03',true,0);`,
    );
    expect((await read()).counts).toMatchObject({ listed: 0, notListed: 2, sitemapChecked: true });
    expect((await read("not_listed")).rows.map((row) => row.listed)).toEqual([false, false]);
  });
  it("preserves snapshot membership and removal/new logic", async () => {
    await db.exec(`INSERT INTO page_snapshots VALUES ('base','project_1','2026-10-01',1,NULL);
      INSERT INTO page_snapshot_pages VALUES ('base','a');
      INSERT INTO sitemap_snapshots ("projectId", "fetchedAt", entries,complete,"urlCount") VALUES ('project_1','2026-10-04','[{"loc":"https://example.com/b"}]',true,1);
      INSERT INTO project_page_sources VALUES ('a','sitemap','2026-10-01','2026-10-02','{"listed":false}'), ('b','sitemap','2026-10-04','2026-10-04','{"listed":true}');`);
    expect((await read()).rows.map((row) => row.statusKind)).toEqual(["removed", "new"]);
  });
});

it("does not keep a stale positive after a newer empty sitemap read", async () => {
  await db.exec(`INSERT INTO project_page_sources VALUES ('a','sitemap','2026-10-01','2026-10-01','{"listed":true}');
    INSERT INTO sitemap_snapshots ("projectId", "fetchedAt",complete,"urlCount") VALUES ('project_1','2026-10-02',true,0);`);
  expect((await read()).rows.map((row) => row.listed)).toEqual([false, false]);
  expect((await read("not_listed")).counts).toMatchObject({ listed: 0, notListed: 2, total: 2 });
});

it("uses the newest stored read while registry source stamps are still catching up", async () => {
  await db.exec(`INSERT INTO project_page_sources VALUES ('a','sitemap','2026-10-01','2026-10-01','{"listed":true}');
    INSERT INTO sitemap_snapshots ("projectId", "fetchedAt", entries,complete,"urlCount") VALUES ('project_1','2026-10-02','[{"loc":"https://www.example.com/a/"},{"loc":"https://other.example.com/b"}]',true,2);`);
  expect((await read()).rows.map((row) => row.listed)).toEqual([true, false]);
  expect((await read("listed")).counts).toMatchObject({ listed: 1, notListed: 1, total: 1 });
});

it("keeps existing membership when a newer read still contains the page", async () => {
  await db.exec(`INSERT INTO page_snapshots VALUES ('base','project_1','2026-10-01',1,NULL);
    INSERT INTO page_snapshot_pages VALUES ('base','a');
    INSERT INTO project_page_sources VALUES ('a','sitemap','2026-10-01','2026-10-01','{"listed":true}');
    INSERT INTO sitemap_snapshots ("projectId", "fetchedAt", entries,complete,"urlCount") VALUES ('project_1','2026-10-02','[{"loc":"https://example.com/a"}]',true,1);`);
  expect((await read()).rows[0]?.statusKind).toBe("in_snapshot");
});

it("reads every matching export row beyond a 50-row table page", async () => {
  await db.exec(`INSERT INTO project_pages
    SELECT 'page_' || n, 'project_1', '/docs/' || n, '2026-10-01'::timestamp, '2026-10-01'::timestamp FROM generate_series(3,121) n;`);
  expect(await execute(queries(undefined, 50).rows)).toHaveLength(50);
  const exported = await execute<{ path: string; listed: boolean | null }>(
    queries(undefined, 5001).rows,
  );
  expect(exported).toHaveLength(121);
  expect(exported.find((row) => row.path === "/docs/121")?.listed).toBeNull();
});

it("matches a newer read after canonicalizing Unicode and dot segments like the registry", async () => {
  await db.exec(`UPDATE project_pages SET path='/caf%C3%A9' WHERE id='a';
    INSERT INTO project_page_sources VALUES ('a','sitemap','2026-10-01','2026-10-01','{"listed":true}');
    INSERT INTO sitemap_snapshots ("projectId", "fetchedAt", entries,complete,"urlCount") VALUES ('project_1','2026-10-02','[{"loc":"https://example.com/tmp/../café/"}]',true,1);`);
  expect((await read()).rows.find((row) => row.path === "/caf%C3%A9")?.listed).toBe(true);
});

it("unions the latest read of every sitemap and ignores superseded content", async () => {
  await db.exec(`INSERT INTO sitemap_snapshots (id,"projectId","sitemapUrl","fetchedAt",entries,complete,"urlCount") VALUES ('old','project_1','https://example.com/pages.xml','2026-10-01','[{"loc":"https://example.com/obsolete"}]',true,1),
    ('pages','project_1','https://example.com/pages.xml','2026-10-03','[{"loc":"https://example.com/a"}]',true,1),
    ('root','project_1','https://example.com/sitemap.xml','2026-10-04','[]',true,0),
    ('posts','project_1','https://example.com/posts.xml','2026-10-04','[{"loc":"https://example.com/b"}]',true,1);`);
  expect(await execute(latestSitemapReadsQuery("project_1", new Date("2026-10-04")))).toHaveLength(
    3,
  );
  expect((await read()).rows.map((row) => row.listed)).toEqual([true, true]);
  expect((await read("listed")).counts).toMatchObject({ listed: 2, notListed: 0, total: 2 });
  expect((await read("not_listed")).rows).toEqual([]);
});
it("does not infer absence for pages first seen after the oldest read", async () => {
  await db.exec(`UPDATE project_pages SET "firstSeenAt"='2026-10-04' WHERE id='b';
    INSERT INTO sitemap_snapshots ("projectId","fetchedAt",entries,complete,"urlCount") VALUES ('project_1','2026-10-03','[{"loc":"https://example.com/a"}]',true,1);`);
  expect((await read()).rows.map((row) => row.listed)).toEqual([true, null]);
  expect((await read("not_listed")).counts).toMatchObject({
    total: 0,
    notListed: null,
    sitemapComplete: false,
  });
  expect((await read("not_listed")).rows).toHaveLength(0);
});
it("does not let a stale sibling sitemap prove absence or removal", async () => {
  await db.exec(`INSERT INTO page_snapshots VALUES ('base','project_1','2026-10-01',1,NULL);
    INSERT INTO page_snapshot_pages VALUES ('base','a');
    INSERT INTO project_page_sources VALUES ('a','sitemap','2026-10-01','2026-10-01','{"listed":true}');
    INSERT INTO sitemap_snapshots ("projectId","sitemapUrl","fetchedAt",entries,complete,"urlCount") VALUES ('project_1','https://example.com/old.xml','2026-03-01','[]',true,0),
    ('project_1','https://example.com/current.xml','2026-10-04','[{"loc":"https://example.com/b"}]',true,1);`);
  expect((await read()).rows).toMatchObject([
    { listed: null, statusKind: "in_snapshot" },
    { listed: true },
  ]);
  expect((await read("not_listed")).rows).toHaveLength(0);
});
it("resolves cross-host sitemap entries against the tracked project", async () => {
  await db.exec(`INSERT INTO sitemap_snapshots ("projectId","sitemapUrl","fetchedAt",entries,complete,"urlCount") VALUES ('project_1','https://example.com/sitemap.xml','2026-10-04','[]',true,0),
    ('project_1','https://cdn.example.org/map.xml','2026-10-04','[{"loc":"https://example.com/a"},{"loc":"https://cdn.example.org/b"}]',true,2);`);
  expect((await read()).rows.map((row) => row.listed)).toEqual([true, false]);
});

it("does not treat child or pruned provenance as permanent monitor authority", async () => {
  await db.exec(`INSERT INTO project_page_sources VALUES ('a','sitemap','2026-10-01','2026-10-01','{"listed":true,"sitemapUrls":["https://example.com/pruned.xml"]}');
    INSERT INTO sitemap_snapshots ("projectId","fetchedAt",entries,complete,"urlCount") VALUES ('project_1','2026-10-04','[{"loc":"https://example.com/b"}]',true,1);`);
  expect((await read()).rows.map((row) => row.listed)).toEqual([false, true]);
  expect((await read()).counts).toMatchObject({ sitemapComplete: true, notListed: 1 });
  expect((await read("not_listed")).rows.map((row) => row.path)).toEqual(["/a"]);
});

it.each([
  ["explicit partial", false, 1, "https://example.com/sitemap.xml"],
  ["count mismatch", true, 2, "https://example.com/sitemap.xml"],
  ["missing configured root", true, 1, "https://example.com/aux.xml"],
] as const)("keeps absence counts unknown for %s", async (_name, complete, count, url) => {
  await db.query(
    `INSERT INTO sitemap_snapshots ("projectId","fetchedAt",entries,complete,"urlCount","sitemapUrl") VALUES ('project_1','2026-10-04','[{"loc":"https://example.com/a"}]',$1,$2,$3)`,
    [complete, count, url],
  );
  expect((await read()).counts).toMatchObject({
    listed: 1,
    notListed: null,
    sitemapComplete: false,
  });
  expect((await read()).rows.map((row) => row.listed)).toEqual([true, null]);
  expect((await read("listed")).rows.map((row) => row.path)).toEqual(["/a"]);
  expect((await read("not_listed")).counts?.total).toBe(0);
  expect((await read("not_listed")).rows).toHaveLength(0);
});
it("defaults historical snapshots to incomplete and rejects null completeness", async () => {
  await db.exec(
    `INSERT INTO sitemap_snapshots ("projectId","fetchedAt") VALUES ('project_1','2026-10-04')`,
  );
  expect((await read()).counts).toMatchObject({ notListed: null, sitemapComplete: false });
  await expect(db.exec(`UPDATE sitemap_snapshots SET complete=NULL`)).rejects.toThrow();
});
it("shares registry first-seen identity and newer positive stamps with API rows", async () => {
  await db.exec(`UPDATE project_pages SET "firstSeenAt"='2026-10-04' WHERE id='b';
    INSERT INTO project_page_sources VALUES ('a','sitemap','2026-10-01','2026-10-04','{"listed":true}');`);
  const readSet = normalizeStoredSitemapReads(
    [
      {
        entries: [],
        fetchedAt: new Date("2026-10-03"),
        sitemapUrl: "https://example.com/sitemap.xml",
        complete: true,
        urlCount: 0,
      },
    ],
    "example.com",
    true,
    new Date("2026-10-04"),
  );
  const api = await execute<{ url: string; listed: boolean | null }>(
    pageSitemapMembershipQuery(
      "project_1",
      readSet ?? { fetchedAt: new Date(), paths: [], checked: false },
      [
        { url: "https://example.com/a", path: "/a", firstSeenAt: new Date("2099-01-01") },
        { url: "https://example.com/b", path: "/b", firstSeenAt: new Date("2000-01-01") },
        { url: "https://example.com/c", path: "/c", firstSeenAt: new Date("2000-01-01") },
        { url: "https://foreign.example.org/c", path: null, firstSeenAt: new Date("2000-01-01") },
      ],
    ),
  );
  const list = await execute<{ path: string; listed: boolean | null }>(
    queries(undefined, 100, readSet).rows,
  );
  expect(api.map((row) => row.listed)).toEqual([true, null, false, null]);
  expect(list.map((row) => row.listed)).toEqual(api.slice(0, 2).map((row) => row.listed));
});

it("does not retain retired roots beyond the snapshot retention window", async () => {
  await db.exec(`INSERT INTO sitemap_snapshots ("projectId","sitemapUrl","fetchedAt",entries,complete,"urlCount") VALUES
    ('project_1','https://example.com/retired.xml','2026-03-01','[]',false,0),
    ('project_1','https://example.com/sitemap.xml','2026-10-04','[]',true,0)`);
  expect((await read()).counts).toMatchObject({ sitemapComplete: true, notListed: 2 });
});

it.each([
  { search: "/b" },
  { source: "manual" as const },
  { tagId: "tag_b" },
  { indexGroup: "indexed" as const },
  { coverageState: "Submitted" },
])("restricts coverage to the registry scope %j", async (filter) => {
  await db.exec(`CREATE TABLE tags (id text, "publicId" text); CREATE TABLE page_tags ("pageId" text, "tagId" text);
    INSERT INTO project_pages VALUES ('late','project_1','/late','2026-10-04','2026-10-04');
    INSERT INTO tags VALUES ('tag_b','public_tag_b'); INSERT INTO page_tags VALUES ('b','tag_b');
    INSERT INTO project_page_sources VALUES ('b','manual','2026-10-01','2026-10-01',NULL);
    INSERT INTO url_presences (id,"projectId",url,"coverageState","checkedAt",verdict) VALUES ('presence_b','project_1','https://example.com/b','Submitted','2026-10-03','PASS');
    INSERT INTO sitemap_snapshots ("projectId","fetchedAt",entries,complete,"urlCount") VALUES ('project_1','2026-10-03','[{"loc":"https://example.com/a"}]',true,1)`);
  expect((await read()).counts).toMatchObject({ sitemapComplete: false });
  const result = await read("not_listed", filter);
  expect(result.counts).toMatchObject({ sitemapComplete: true, notListed: 1, total: 1 });
  expect(result.rows).toMatchObject([{ path: "/b", listed: false }]);
  expect(result.rows).toHaveLength(1);
});
