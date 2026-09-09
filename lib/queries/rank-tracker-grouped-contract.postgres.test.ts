import {
  aggregateMarketGridRows,
  compareMarketGridAggregates,
  marketGridTerm,
} from "@/lib/keywords/market-grid-model";
import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import { RANK_TRACKER_SORT_FIELDS } from "@/lib/keywords/rank-tracker-query-types";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { applyTemporaryKeywordNormalizationMigration } from "./rank-tracker-grouped-contract-helpers";
import { exactRankTrackerGroupedRows } from "./rank-tracker-grouped-exact";
import {
  type GroupedContractTarget,
  groupedContractFixture,
} from "./rank-tracker-grouped-fixtures";
import { GROUPED_SQL_SORT_FIELDS } from "./rank-tracker-grouped-sort";
import { buildRankTrackerGroupedSql } from "./rank-tracker-grouped-sql";
import { assertTemporaryDeviceEnum } from "./rank-tracker-grouped-test-database";

const connectionString =
  process.env.RANK_TRACKER_GROUPED_POSTGRES_URL?.trim() ||
  process.env.DIRECT_URL?.trim() ||
  process.env.DATABASE_URL?.trim();

type GroupMember = { id: string; marketStatus: "active" | "paused" | "removed"; publicId: string };
type GroupedSqlResult = {
  groups: Array<{ members: GroupMember[]; term: string }>;
  matchedGroupCount: number;
  matchedTargetCount: number;
};

function member(target: GroupedContractTarget): GroupMember {
  return {
    id: target.internalId,
    marketStatus: target.marketStatus ?? "active",
    publicId: target.publicId,
  };
}

function exactGroups(sort: (typeof defaultRankTrackerQueryState)["sort"]) {
  return aggregateMarketGridRows(groupedContractFixture().targets)
    .sort((left, right) => compareMarketGridAggregates(left, right, sort))
    .map((aggregate) => ({
      members: aggregate.children.map((child) => member(child as GroupedContractTarget)),
      term: marketGridTerm(aggregate.keyword),
    }));
}

function rowsForMembers(groups: GroupedSqlResult["groups"], targets: GroupedContractTarget[]) {
  const byPublicId = new Map(targets.map((target) => [target.publicId, target]));
  return groups.flatMap((group) =>
    group.members.flatMap((selected) => {
      const target = byPublicId.get(selected.publicId);
      return target ? [{ ...target, marketStatus: selected.marketStatus }] : [];
    }),
  );
}

async function seed(client: Client) {
  const fixture = groupedContractFixture();
  await client.query(`
    CREATE TYPE pg_temp."Device" AS ENUM ('desktop', 'mobile');
    CREATE TEMP TABLE locations (
      id text PRIMARY KEY, "canonicalKey" text NOT NULL, "displayName" text NOT NULL,
      hl text NOT NULL, kind text NOT NULL
    ) ON COMMIT DROP;
    CREATE TEMP TABLE keywords (
      id text PRIMARY KEY, "publicId" text NOT NULL, "projectId" text NOT NULL,
      text text NOT NULL, "locationId" text NOT NULL, device pg_temp."Device" NOT NULL,
      "createdAt" timestamptz NOT NULL, "archivedAt" timestamptz, "targetUrl" text, topic text, intent text
    ) ON COMMIT DROP;
    CREATE TEMP TABLE project_markets (
      "projectId" text NOT NULL, "locationId" text NOT NULL, status text NOT NULL
    ) ON COMMIT DROP;
    CREATE TEMP TABLE rank_checks (
      id text PRIMARY KEY, "keywordId" text NOT NULL, status text NOT NULL,
      "checkedAt" timestamptz NOT NULL, "normalizationVersion" text, "requestedDepth" integer,
      "rankingUrl" text, position integer, raw jsonb
    ) ON COMMIT DROP;
    CREATE TEMP TABLE keyword_tags ("keywordId" text NOT NULL, "tagId" text NOT NULL) ON COMMIT DROP;
    CREATE TEMP TABLE tags (id text PRIMARY KEY, name text NOT NULL) ON COMMIT DROP;
    CREATE TEMP TABLE keyword_traffic_snapshots (
      "keywordId" text NOT NULL, provider text NOT NULL, date date NOT NULL,
      clicks integer NOT NULL, impressions integer NOT NULL, ctr double precision NOT NULL
    ) ON COMMIT DROP;
    CREATE TEMP TABLE provider_connections (
      "projectId" text NOT NULL, provider text NOT NULL, kind text NOT NULL,
      enabled boolean NOT NULL, status text NOT NULL, priority integer
    ) ON COMMIT DROP;
    CREATE INDEX "keywords_projectId_normalized_text_idx"
      ON keywords ("projectId", lower(btrim(text)));
  `);
  await applyTemporaryKeywordNormalizationMigration(client);
  for (const location of fixture.locations) {
    await client.query(
      'INSERT INTO locations (id, "canonicalKey", "displayName", hl, kind) VALUES ($1, $2, $3, $4, $5)',
      [location.id, location.canonicalKey, location.displayName, location.hl, location.kind],
    );
    await client.query(
      'INSERT INTO project_markets ("projectId", "locationId", status) VALUES ($1, $2, $3)',
      [
        "project_grouped",
        location.id,
        fixture.targets.find((target) => target.location.id === location.id)?.marketStatus ??
          "active",
      ],
    );
  }
  for (const target of fixture.targets) {
    await client.query(
      `INSERT INTO keywords (id, "publicId", "projectId", text, "locationId", device, "createdAt", "targetUrl", topic, intent)
       VALUES ($1, $2, 'project_grouped', $3, $4, $5::pg_temp."Device", '2026-09-01T00:00:00.000Z', $6, $7, $8)`,
      [
        target.internalId,
        target.publicId,
        target.keyword,
        target.location.id,
        target.device.toLowerCase(),
        target.targetUrl,
        target.topic,
        target.intent,
      ],
    );
    const current = new Date(target.lastCheckAt ?? "2026-09-02T00:00:00.000Z");
    const previous = new Date(current.getTime() - 86_400_000);
    const metrics = {
      difficulty: target.difficultyKnown === false ? null : target.difficulty,
      volume: target.volumeKnown === false ? null : target.volume,
    };
    await client.query(
      `INSERT INTO rank_checks (id, "keywordId", status, "checkedAt", "normalizationVersion", "requestedDepth", "rankingUrl", position, raw)
       VALUES ($1, $2, 'completed', $3, 'v1', 100, $4, $5, $6::jsonb),
              ($7, $2, 'completed', $8, 'v1', 100, $4, $9, $6::jsonb)`,
      [
        `${target.internalId}_current`,
        target.internalId,
        current,
        target.rankingUrl,
        target.position,
        JSON.stringify(metrics),
        `${target.internalId}_previous`,
        previous,
        target.positionBaseline,
      ],
    );
  }
  return fixture.targets;
}

describe("rank tracker grouped SQL contract", () => {
  it.runIf(Boolean(connectionString))(
    "matches the exact aggregate contract for SQL and fallback sorts",
    async () => {
      const client = new Client({ connectionString });
      await client.connect();
      await client.query("BEGIN");
      try {
        const targets = await seed(client);
        expect(targets).toHaveLength(40);
        expect(new Set(targets.map((target) => marketGridTerm(target.keyword))).size).toBe(6);
        expect(await assertTemporaryDeviceEnum(client)).toEqual({
          isEnum: true,
          isTemporary: true,
          labels: ["desktop", "mobile"],
          name: "Device",
        });
        const collation = await client.query<{ supported: boolean }>(
          "SELECT EXISTS (SELECT FROM pg_collation WHERE collname = 'en-US-x-icu') AS supported",
        );
        expect(collation.rows[0]?.supported).toBe(true);
        const normalized = await client.query<{ publicId: string; textNormalized: string }>(
          'SELECT "publicId", "textNormalized" FROM keywords ORDER BY id',
        );
        const normalizedByPublicId = new Map(
          normalized.rows.map((row) => [row.publicId, row.textNormalized]),
        );
        expect(targets.map((target) => normalizedByPublicId.get(target.publicId))).toEqual(
          targets.map((target) => marketGridTerm(target.keyword)),
        );

        for (const field of RANK_TRACKER_SORT_FIELDS) {
          for (const direction of ["asc", "desc"] as const) {
            const sortContext = `grouped SQL sort field=${field} direction=${direction}`;
            const query = {
              ...defaultRankTrackerQueryState,
              grouped: true,
              pageSize: 25 as const,
              sort: { direction, field },
            };
            const candidatesOnly = !GROUPED_SQL_SORT_FIELDS.has(field);
            const statement = buildRankTrackerGroupedSql("project_grouped", query, {
              candidatesOnly,
            });
            const result = await client.query<GroupedSqlResult>(statement.text, statement.values);
            const actual = result.rows[0];
            expect(actual, sortContext).toMatchObject({
              matchedGroupCount: 6,
              matchedTargetCount: 40,
            });
            if (!actual) throw new Error(`${sortContext}: expected grouped SQL result.`);

            if (!candidatesOnly) {
              expect(actual.groups, sortContext).toEqual(exactGroups(query.sort));
              continue;
            }

            const exact = exactRankTrackerGroupedRows(
              rowsForMembers(actual.groups, targets),
              query,
            );
            expect(exact, sortContext).toMatchObject({
              matchedGroupCount: 6,
              matchedTargetCount: 40,
            });
            expect(
              exact.groups.map((group) => ({
                members: group.subRows.map((child) => member(child as GroupedContractTarget)),
                term: marketGridTerm(group.keyword),
              })),
              sortContext,
            ).toEqual(exactGroups(query.sort));
          }
        }

        const pageQuery = {
          ...defaultRankTrackerQueryState,
          grouped: true,
          page: 2,
          pageSize: 25 as const,
          sort: { direction: "asc" as const, field: "keyword" as const },
        };
        const pageStatement = buildRankTrackerGroupedSql("project_grouped", pageQuery);
        const pageResult = await client.query<GroupedSqlResult>(
          pageStatement.text,
          pageStatement.values,
        );
        const pageContext = "grouped SQL sort field=keyword direction=asc page=2";
        expect(pageResult.rows[0], pageContext).toMatchObject({
          matchedGroupCount: 6,
          matchedTargetCount: 40,
        });
        expect(pageResult.rows[0]?.groups, pageContext).toEqual(
          exactGroups(pageQuery.sort).slice(25, 50),
        );
      } finally {
        await client.query("ROLLBACK");
        await client.end();
      }
    },
  );
});
