import { Buffer } from "node:buffer";
import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import {
  buildDataTablePerfFixture,
  DATA_TABLE_PERF_COUNTS,
  DATA_TABLE_PERF_PROJECT,
} from "./rank-tracker-grouped-performance-fixtures";
import { groupedPerformancePayload } from "./rank-tracker-grouped-performance-payload";
import {
  buildRankTrackerGroupedExplainSql,
  buildRankTrackerGroupedSql,
} from "./rank-tracker-grouped-sql";
import { withTemporaryGroupedDatabase } from "./rank-tracker-grouped-test-database";

type ExplainRow = { "QUERY PLAN": string };
type GroupedResult = {
  groups: Array<{
    members: Array<{
      id: string;
      marketStatus: "active" | "paused" | "removed";
      publicId: string;
    }>;
    term: string;
  }>;
  matchedGroupCount: number;
  matchedTargetCount: number;
};

function indexName(value: string | undefined) {
  return value?.replaceAll('"', "").split(".").at(-1);
}

function planIndexes(plan: string) {
  return [
    ...plan.matchAll(/(?:Bitmap Index Scan|Index Only Scan|Index Scan) (?:using|on) ([^\s]+)/g),
  ]
    .map((match) => indexName(match[1]))
    .filter((value): value is string => Boolean(value));
}

function executionTime(plan: string) {
  const match = /Execution Time:\s+([\d.]+) ms/.exec(plan);
  if (!match?.[1]) throw new Error(`EXPLAIN ANALYZE did not include execution time.\n${plan}`);
  return Number(match[1]);
}

async function insertJson(client: Client, sql: string, rows: unknown[], values: unknown[] = []) {
  for (let offset = 0; offset < rows.length; offset += 500) {
    await client.query(sql, [JSON.stringify(rows.slice(offset, offset + 500)), ...values]);
  }
}

async function seedPerformanceFixture(client: Client) {
  const fixture = buildDataTablePerfFixture();
  await insertJson(
    client,
    `INSERT INTO locations (id, "canonicalKey", "displayName", hl, kind)
     SELECT id, "canonicalKey", "displayName", hl, kind
     FROM jsonb_to_recordset($1::jsonb) AS item(
       id text, "canonicalKey" text, "displayName" text, hl text, kind text
     )`,
    fixture.locations,
  );
  await insertJson(
    client,
    `INSERT INTO project_markets ("projectId", "locationId", status)
     SELECT $2, id, status
     FROM jsonb_to_recordset($1::jsonb) AS item(id text, status text)`,
    fixture.locations,
    [DATA_TABLE_PERF_PROJECT.id],
  );
  await insertJson(
    client,
    `INSERT INTO keywords (
       id, "publicId", "projectId", text, "locationId", device, "createdAt", "targetUrl", topic, intent
     ) SELECT id, "publicId", $2, text, "locationId", device::pg_temp."Device", "createdAt", "targetUrl", topic, intent
       FROM jsonb_to_recordset($1::jsonb) AS item(
         id text, "publicId" text, text text, "locationId" text, device text,
         "createdAt" timestamptz, "targetUrl" text, topic text, intent text
       )`,
    fixture.targets.map((target) => ({
      createdAt: "2026-08-20T12:00:00.000Z",
      device: target.device,
      id: target.id,
      intent: target.intent,
      locationId: target.locationId,
      publicId: target.publicId,
      targetUrl: target.targetUrl,
      text: target.keyword,
      topic: target.topic,
    })),
    [DATA_TABLE_PERF_PROJECT.id],
  );
  await insertJson(
    client,
    `INSERT INTO rank_checks (
       id, "keywordId", status, "checkedAt", "normalizationVersion", "requestedDepth",
       "rankingUrl", position, "previousPosition", raw
     ) SELECT id, "keywordId", status, "checkedAt", "normalizationVersion", "requestedDepth",
       "rankingUrl", position, "previousPosition", raw
       FROM jsonb_to_recordset($1::jsonb) AS item(
         id text, "keywordId" text, status text, "checkedAt" timestamptz,
         "normalizationVersion" text, "requestedDepth" integer, "rankingUrl" text,
         position integer, "previousPosition" integer, raw jsonb
       )`,
    fixture.targets.flatMap((target) =>
      target.rankHistory.map((check, index) => ({
        checkedAt: check.checkedAt,
        id: `dt_perf_check_${target.id}_${index}`,
        keywordId: target.id,
        normalizationVersion: "v1",
        position: check.position,
        previousPosition: check.previousPosition,
        rankingUrl: check.rankingUrl,
        raw: { difficulty: 40, serpFeatures: ["image"], volume: 1000 },
        requestedDepth: 100,
        status: "completed",
      })),
    ),
  );
  await client.query(
    'CREATE INDEX ON rank_checks ("keywordId", "checkedAt" DESC, id DESC); ANALYZE keywords; ANALYZE rank_checks; ANALYZE locations; ANALYZE project_markets',
  );
  return fixture;
}

async function seedNormalizationIndexBackground(client: Client) {
  const backgroundProjectCount = 24;
  const targetsPerProject = DATA_TABLE_PERF_COUNTS.targets;
  const inserted = await client.query(
    `INSERT INTO keywords (
       id, "publicId", "projectId", text, "locationId", device, "createdAt", "targetUrl", topic, intent
     ) SELECT
       format('dt_perf_background_keyword_%s_%s', project, target),
       format('kw_background_%s_%s', project, target),
       format('dt_perf_background_project_%s', project),
       format('background rank tracker performance %s', target),
       'fixture_dt_perf_location_us_20260905', 'desktop', '2026-08-20T12:00:00.000Z',
       format('https://example.org/background/%s/%s', project, target), 'Docs', 'informational'
     FROM generate_series(1, $1) project CROSS JOIN generate_series(1, $2) target`,
    [backgroundProjectCount, targetsPerProject],
  );
  await client.query("ANALYZE keywords");
  return {
    backgroundProjectCount,
    backgroundRowCount: inserted.rowCount ?? 0,
  };
}

async function normalizationIndex(client: Client) {
  const result = await client.query<{ indexName: string }>(
    `SELECT indexrelid::regclass::text AS "indexName"
     FROM pg_index
     WHERE indrelid = 'keywords'::regclass
       AND pg_get_indexdef(indexrelid) LIKE '%"textNormalized"%'`,
  );
  const name = indexName(result.rows[0]?.indexName);
  if (!name) throw new Error("The temporary normalization migration did not create an index.");
  return name;
}

describe("rank tracker grouped query performance", () => {
  it.each([
    ["default position ascending", defaultRankTrackerQueryState.sort],
    ["keyword ascending", { direction: "asc" as const, field: "keyword" as const }],
  ])("keeps the query under 150ms for %s", async (_name, sort) => {
    await withTemporaryGroupedDatabase(async (client) => {
      const fixture = await seedPerformanceFixture(client);
      expect(fixture.targets).toHaveLength(DATA_TABLE_PERF_COUNTS.targets);
      const query = {
        ...defaultRankTrackerQueryState,
        grouped: true,
        pageSize: 50 as const,
        sort,
      };
      const migrationIndex = await normalizationIndex(client);
      const statement = buildRankTrackerGroupedExplainSql(DATA_TABLE_PERF_PROJECT.id, query);
      const explained = await client.query<ExplainRow>(statement.text, statement.values);
      const plan = explained.rows.map((row) => row["QUERY PLAN"]).join("\n");
      const actualIndexes = planIndexes(plan);
      const elapsedMs = executionTime(plan);
      const selection = buildRankTrackerGroupedSql(DATA_TABLE_PERF_PROJECT.id, query);
      const result = await client.query<GroupedResult>(selection.text, selection.values);
      const page = result.rows[0];
      expect(page, plan).toMatchObject({
        matchedGroupCount: DATA_TABLE_PERF_COUNTS.groups,
        matchedTargetCount: DATA_TABLE_PERF_COUNTS.targets,
      });
      const groups = page?.groups ?? [];
      expect(groups).toHaveLength(50);
      expect(groups.every((group) => group.members.length === 5)).toBe(true);
      console.info(
        JSON.stringify({
          actualPlan: plan.split("\n").map((line) => line.trim()),
          elapsedMs,
          indexes: actualIndexes,
          normalizationIndex: migrationIndex,
          normalizationIndexSelected: actualIndexes.includes(migrationIndex),
          scope: "all-one-project",
          sort,
          type: "rank-tracker-grouped-query-performance",
        }),
      );
      expect(elapsedMs, plan).toBeLessThan(150);
    });
  });

  it.each([
    ["default position ascending", defaultRankTrackerQueryState.sort],
    ["keyword ascending", { direction: "asc" as const, field: "keyword" as const }],
  ])("retains the independent JSON payload diagnostic for %s", async (_name, sort) => {
    await withTemporaryGroupedDatabase(async (client) => {
      const fixture = await seedPerformanceFixture(client);
      const query = {
        ...defaultRankTrackerQueryState,
        grouped: true,
        pageSize: 50 as const,
        sort,
      };
      const selection = buildRankTrackerGroupedSql(DATA_TABLE_PERF_PROJECT.id, query);
      const result = await client.query<GroupedResult>(selection.text, selection.values);
      const page = result.rows[0];
      expect(page).toMatchObject({
        matchedGroupCount: DATA_TABLE_PERF_COUNTS.groups,
        matchedTargetCount: DATA_TABLE_PERF_COUNTS.targets,
      });
      const groups = page?.groups ?? [];
      expect(groups).toHaveLength(50);
      expect(groups.every((group) => group.members.length === 5)).toBe(true);

      const groupRows = groupedPerformancePayload(fixture, page ?? { groups: [] });
      const payloadBytes = Buffer.byteLength(JSON.stringify(groupRows), "utf8");
      const budgetBytes = 250 * 1024;
      console.info(
        JSON.stringify({
          budgetBytes,
          payloadBytes,
          sort,
          type: "rank-tracker-grouped-json-payload-diagnostic",
          withinBudget: payloadBytes <= budgetBytes,
        }),
      );

      expect(groupRows).toHaveLength(50);
      expect(groupRows.every((group) => group.subRows.length === 5)).toBe(true);
      expect(
        groupRows.every(
          (group) =>
            group.marketGrid?.kind === "parent" && group.marketGrid.aggregate.children.length === 5,
        ),
      ).toBe(true);
      expect(
        groupRows.every((group) =>
          group.subRows.every(
            (row) =>
              row.positionHistory.length > 0 && row.sparkline.length > 0 && row.schedule !== null,
          ),
        ),
      ).toBe(true);
    });
  });

  it("proves normalization-index selection for a realistic multi-project fixture", async () => {
    await withTemporaryGroupedDatabase(async (client) => {
      await seedPerformanceFixture(client);
      const background = await seedNormalizationIndexBackground(client);
      expect(background.backgroundRowCount).toBe(
        background.backgroundProjectCount * DATA_TABLE_PERF_COUNTS.targets,
      );
      const query = {
        ...defaultRankTrackerQueryState,
        grouped: true,
        pageSize: 50 as const,
      };
      const migrationIndex = await normalizationIndex(client);
      const statement = buildRankTrackerGroupedExplainSql(DATA_TABLE_PERF_PROJECT.id, query);
      const explained = await client.query<ExplainRow>(statement.text, statement.values);
      const plan = explained.rows.map((row) => row["QUERY PLAN"]).join("\n");
      const actualIndexes = planIndexes(plan);
      console.info(
        JSON.stringify({
          actualPlan: plan.split("\n").map((line) => line.trim()),
          ...background,
          indexes: actualIndexes,
          normalizationIndex: migrationIndex,
          normalizationIndexSelected: actualIndexes.includes(migrationIndex),
          scope: "multi-project-selectivity",
          type: "rank-tracker-grouped-normalization-index-evidence",
        }),
      );
      expect(actualIndexes, plan).toContain(migrationIndex);
    });
  });
});
