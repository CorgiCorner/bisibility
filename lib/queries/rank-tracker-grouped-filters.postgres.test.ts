import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import type { RankTrackerQueryState } from "@/lib/keywords/rank-tracker-query-types";
import { describe, expect, it } from "vitest";
import { exactRankTrackerGroupedRows } from "./rank-tracker-grouped-exact";
import {
  type GroupedFilterTarget,
  groupedFilterEdgeFixture,
  groupedFilterFixture,
} from "./rank-tracker-grouped-filter-fixtures";
import { rankTrackerGroupedRawSelectionSchema } from "./rank-tracker-grouped-schema";
import { buildRankTrackerGroupedSql } from "./rank-tracker-grouped-sql";
import {
  assertTemporaryDeviceEnum,
  withGroupedFilterDatabase,
} from "./rank-tracker-grouped-test-database";
import { requiresExactRows } from "./rank-tracker-selection-core";

type FilterCase = {
  aggregate?: { activeTargetCount: number; position: number; volume: number };
  expected: readonly string[];
  name: string;
  query: (state: RankTrackerQueryState) => RankTrackerQueryState;
};
const filters = defaultRankTrackerQueryState.filters;
const filterCases: readonly FilterCase[] = [
  {
    expected: ["alpha-us"],
    name: "position bucket",
    query: (state) => ({ ...state, filters: { ...filters, position: ["top3"] } }),
  },
  {
    expected: ["alpha-us"],
    name: "change",
    query: (state) => ({ ...state, filters: { ...filters, change: "up" } }),
  },
  {
    aggregate: { activeTargetCount: 1, position: 2, volume: 21_000 },
    expected: ["alpha-us"],
    name: "volume range",
    query: (state) => ({ ...state, filters: { ...filters, volMax: 21, volMin: 20 } }),
  },
  {
    aggregate: { activeTargetCount: 2, position: 2, volume: 23_000 },
    expected: ["alpha-pl", "alpha-us"],
    name: "contains",
    query: (state) => ({ ...state, filters: { ...filters, contains: "alpha" } }),
  },
  {
    expected: ["alpha-us"],
    name: "tag",
    query: (state) => ({ ...state, filters: { ...filters, tags: ["Growth"] } }),
  },
  {
    expected: [],
    name: "archived search exact fallback",
    query: (state) => ({ ...state, search: "Archived" }),
  },
  {
    expected: ["alpha-us"],
    name: "topic",
    query: (state) => ({ ...state, filters: { ...filters, topics: ["Guide"] } }),
  },
  {
    expected: ["alpha-us"],
    name: "intent",
    query: (state) => ({ ...state, filters: { ...filters, intents: ["commercial"] } }),
  },
  {
    expected: ["alpha-us"],
    name: "SERP",
    query: (state) => ({ ...state, filters: { ...filters, serp: ["image"] } }),
  },
  {
    expected: ["alpha-us"],
    name: "last check",
    query: (state) => ({ ...state, filters: { ...filters, lastCheck: "completed" } }),
  },
  {
    expected: ["alpha-us"],
    name: "wrong URL",
    query: (state) => ({ ...state, filters: { ...filters, wrongUrl: true } }),
  },
  {
    expected: ["alpha-us"],
    name: "URL changed",
    query: (state) => ({ ...state, filters: { ...filters, urlChanged: true } }),
  },
  {
    expected: ["alpha-us"],
    name: "search",
    query: (state) => ({ ...state, search: "needle" }),
  },
  {
    expected: ["alpha-us"],
    name: "location lens",
    query: (state) => ({ ...state, lens: { ...state.lens, locationId: "US:en" } }),
  },
];
function groupedQuery(): RankTrackerQueryState {
  return {
    ...defaultRankTrackerQueryState,
    grouped: true,
    pageSize: 50,
    sort: { direction: "asc", field: "keyword" },
  };
}
function archivedGroupedFilterFixture() {
  const fixture = groupedFilterFixture();
  const base = fixture.targets[0];
  if (!base) return fixture;
  const archived = (suffix: string, keyword: string) => ({
    ...base,
    archivedAt: "2026-09-04T00:00:00.000Z",
    intent: "archived-intent",
    internalId: `keyword_archived_${suffix}`,
    keyword,
    publicId: `archived-${suffix}`,
    rankChecks: base.rankChecks.map((check) => ({ ...check, id: `${check.id}_${suffix}` })),
    tags: ["Archived"],
    targetUrl: `https://example.com/archived-${suffix}`,
    topic: "Archived Topic",
  });
  return {
    ...fixture,
    targets: [
      ...fixture.targets,
      archived("alpha-us", "Alpha Focus"),
      archived("only-us", "Archived Only"),
    ],
  };
}
const expectedGroups = (ids: readonly string[]) =>
  ids.length ? [{ children: ids, term: "alpha focus" }] : [];
const rawGroups = (groups: Array<{ members: Array<{ publicId: string }>; term: string }>) =>
  groups.map((group) => ({
    children: group.members.map((member) => member.publicId),
    term: group.term,
  }));
const exactGroups = (rows: ReturnType<typeof exactRankTrackerGroupedRows>["groups"]) =>
  rows.map((group) => ({
    children: group.subRows.map((child) => child.id),
    term: group.keyword.trim().toLowerCase(),
  }));
function hydratedCandidates(
  groups: Array<{
    members: Array<{ marketStatus: "active" | "paused" | "removed"; publicId: string }>;
  }>,
  targets: readonly GroupedFilterTarget[],
) {
  const byId = new Map(targets.map((target) => [target.publicId, target]));
  return groups.flatMap((group) =>
    group.members.flatMap((member) => {
      const target = byId.get(member.publicId);
      return target ? [{ ...target, marketStatus: member.marketStatus }] : [];
    }),
  );
}
describe("rank tracker grouped filter PostgreSQL contract", () => {
  it("returns only matching children for all grouped filters and their exact fallback", async () => {
    const fixture = archivedGroupedFilterFixture();
    await withGroupedFilterDatabase(
      fixture.projectId,
      fixture.locations,
      fixture.targets,
      async (client) => {
        expect(await assertTemporaryDeviceEnum(client)).toEqual({
          isEnum: true,
          isTemporary: true,
          labels: ["desktop", "mobile"],
          name: "Device",
        });
        const normalized = await client.query<{ textNormalized: string }>(
          'SELECT "textNormalized" FROM keywords WHERE "publicId" = $1',
          ["alpha-us"],
        );
        expect(normalized.rows[0]?.textNormalized).toBe("alpha focus");
        const overview = rankTrackerGroupedRawSelectionSchema.parse(
          (await client.query(buildRankTrackerGroupedSql(fixture.projectId, groupedQuery())))
            .rows[0],
        );
        expect(overview).toMatchObject({
          matchedGroupCount: 2,
          matchedTargetCount: 3,
          totalCount: 3,
        });
        expect(rawGroups(overview.groups)).toEqual([
          { children: ["alpha-pl", "alpha-us"], term: "alpha focus" },
          { children: ["beta-pl"], term: "beta control" },
        ]);
        for (const label of ["Archived", "Archived Topic", "archived-intent"])
          expect(JSON.stringify(overview.facets)).not.toContain(label);
        for (const filterCase of filterCases) {
          const query = filterCase.query(groupedQuery());
          const exact = requiresExactRows(query);
          if (filterCase.name === "archived search exact fallback") expect(exact).toBe(true);
          const statement = buildRankTrackerGroupedSql(fixture.projectId, query, {
            candidatesOnly: exact,
          });
          const result = await client.query(statement.text, statement.values);
          const raw = rankTrackerGroupedRawSelectionSchema.parse(result.rows[0]);
          const context = `grouped filter: ${filterCase.name}`;
          expect(raw.totalCount, context).toBe(3);
          if (!exact) {
            expect(raw.matchedTargetCount, context).toBe(filterCase.expected.length);
            expect(raw.matchedGroupCount, context).toBe(filterCase.expected.length ? 1 : 0);
            expect(rawGroups(raw.groups), context).toEqual(expectedGroups(filterCase.expected));
          }
          const matched = exactRankTrackerGroupedRows(
            hydratedCandidates(raw.groups, fixture.targets),
            query,
          );
          expect(matched.matchedTargetCount, context).toBe(filterCase.expected.length);
          expect(matched.matchedGroupCount, context).toBe(filterCase.expected.length ? 1 : 0);
          expect(exactGroups(matched.groups), context).toEqual(expectedGroups(filterCase.expected));
          if (filterCase.aggregate) {
            expect(matched.groups[0], context).toMatchObject({
              marketGrid: { aggregate: filterCase.aggregate },
              position: filterCase.aggregate.position,
              volume: filterCase.aggregate.volume,
            });
          }
        }
        const query: RankTrackerQueryState = {
          ...groupedQuery(),
          filters: {
            ...filters,
            position: ["top3"],
            serp: ["image"],
            tags: ["Growth"],
            urlChanged: true,
            volMax: 21,
            volMin: 20,
            wrongUrl: true,
          },
          search: "needle",
        };
        const statement = buildRankTrackerGroupedSql(fixture.projectId, query, {
          candidatesOnly: true,
        });
        const result = await client.query(statement.text, statement.values);
        const raw = rankTrackerGroupedRawSelectionSchema.parse(result.rows[0]);
        expect(rawGroups(raw.groups)).toEqual(expectedGroups(["alpha-us"]));
        const matched = exactRankTrackerGroupedRows(
          hydratedCandidates(raw.groups, fixture.targets),
          query,
        );
        expect(matched).toMatchObject({ matchedGroupCount: 1, matchedTargetCount: 1 });
        expect(exactGroups(matched.groups)).toEqual(expectedGroups(["alpha-us"]));
      },
    );
  });
  it("keeps zero-volume and date-boundary candidates in an explicit edge fixture", async () => {
    const fixture = groupedFilterEdgeFixture();
    await withGroupedFilterDatabase(
      fixture.projectId,
      fixture.locations,
      fixture.targets,
      async (client) => {
        const zeroVolumeQuery = { ...groupedQuery(), filters: { ...filters, volMax: 0 } };
        const zeroVolume = await client.query(
          buildRankTrackerGroupedSql(fixture.projectId, zeroVolumeQuery, { candidatesOnly: true }),
        );
        const zeroVolumeRaw = rankTrackerGroupedRawSelectionSchema.parse(zeroVolume.rows[0]);
        expect(
          zeroVolumeRaw.groups.flatMap((group) => group.members.map((member) => member.publicId)),
        ).toContain("zero-volume-us");
        expect(
          exactGroups(
            exactRankTrackerGroupedRows(
              hydratedCandidates(zeroVolumeRaw.groups, fixture.targets),
              zeroVolumeQuery,
            ).groups,
          ),
        ).toEqual([{ children: ["zero-volume-us"], term: "zero volume" }]);
        const boundaryQuery = {
          ...groupedQuery(),
          filters: { ...filters, change: "new" as const },
        };
        const boundary = await client.query(
          buildRankTrackerGroupedSql(fixture.projectId, boundaryQuery, { candidatesOnly: true }),
        );
        const boundaryRaw = rankTrackerGroupedRawSelectionSchema.parse(boundary.rows[0]);
        expect(
          boundaryRaw.groups.flatMap((group) => group.members.map((member) => member.publicId)),
        ).toContain("boundary-us");
        expect(
          exactGroups(
            exactRankTrackerGroupedRows(
              hydratedCandidates(boundaryRaw.groups, fixture.targets),
              boundaryQuery,
            ).groups,
          ),
        ).toEqual([
          { children: ["alpha-pl"], term: "alpha focus" },
          { children: ["boundary-us"], term: "boundary date" },
        ]);
      },
    );
  });
});
