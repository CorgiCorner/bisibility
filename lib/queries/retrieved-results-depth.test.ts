import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { storedResultsIndex } from "./retrieved-results";

let db: PGlite;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $queryRaw: async (query: { text: string; values: unknown[] }) =>
      (await db.query(query.text, query.values)).rows,
  },
}));
vi.mock("@/lib/rank-check/raw-retention", () => ({ getRankCheckRawRetentionDays: () => null }));
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE keywords(id text, "publicId" text, "projectId" text);
  CREATE TABLE rank_checks(id text, "publicId" text, "keywordId" text, "checkedAt" timestamptz, position int, provider text, "requestedDepth" int, "degradedToCountry" boolean, "errorCode" text, "normalizationVersion" text, raw jsonb, "organicRanks" jsonb, status text);
  CREATE TABLE observation_runs("rankCheckId" text, "projectId" text, completeness text);`);
}, 30000);
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.exec(
    `TRUNCATE keywords,rank_checks,observation_runs; INSERT INTO keywords VALUES('kw','kw_example','project');`,
  );
});
async function check(
  options: { gap?: boolean; position?: number; error?: string; anomalies?: unknown[] } = {},
) {
  const raw = {
    normalization: {
      version: "v2",
      outcome: options.position ? "match" : "no_match",
      anomalies: options.anomalies ?? [],
    },
    organic_results: Array.from({ length: 20 }, (_, index) => ({
      rank: index + 1,
      url: `https://example.org/${index}`,
      domain: "example.org",
    })).filter((row) => !options.gap || row.rank !== 10),
  };
  await db.query(
    `INSERT INTO rank_checks VALUES('check','check_example','kw',NOW(),$1,'serpapi',20,false,$2,'v2',$3,NULL,'completed')`,
    [options.position ?? null, options.error ?? null, JSON.stringify(raw)],
  );
  return storedResultsIndex({ projectId: "project", keywordPublicId: "kw_example" });
}
it("retains the requested no-match depth only with the full normalized prefix", async () => {
  expect(await check()).toMatchObject([{ recordedNoMatchDepth: 20 }]);
});
it("does not infer absence from a highest rank of 20 with an internal gap", async () => {
  const [row] = await check({ gap: true });
  expect(row.retrievedPositions).toBe(20);
  expect(row.recordedNoMatchDepth).toBeUndefined();
});
it.each([
  { position: 3 },
  { error: "organic_depth_not_covered" },
  { anomalies: [{ code: "organic_depth_not_covered", index: 9 }] },
])("does not promote a ranked or indeterminate result %j", async (options) => {
  expect((await check(options))[0].recordedNoMatchDepth).toBeUndefined();
});
