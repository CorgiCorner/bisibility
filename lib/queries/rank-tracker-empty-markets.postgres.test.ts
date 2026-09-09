import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import { describe, expect, it, vi } from "vitest";
import { groupedFilterFixture } from "./rank-tracker-grouped-filter-fixtures";
import { getRankTrackerGroupedList } from "./rank-tracker-grouped-list";
import { buildRankTrackerGroupedSql } from "./rank-tracker-grouped-sql";
import { withGroupedFilterDatabase } from "./rank-tracker-grouped-test-database";
import { getRankTrackerKeywordList } from "./rank-tracker-list";
import { buildRankTrackerListSql } from "./rank-tracker-list-sql";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  hydrate: vi.fn<(project: unknown, ids: string[]) => Promise<never[]>>(async () => []),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $queryRaw: mocks.queryRaw } }));
vi.mock("./_auth", () => ({
  requireReadableProject: async () => ({ project: { id: "project_empty", domain: "example.com" } }),
}));
vi.mock("./keyword-row-loader", () => ({ loadKeywordRowsByInternalIds: mocks.hydrate }));

const emptyLocation = {
  canonicalKey: "ES:es",
  displayName: "Spain",
  hl: "es",
  id: "empty_spain",
  kind: "country",
};

describe("registered empty market scopes", () => {
  for (const status of ["active", "paused"] as const) {
    for (const populatedProject of [false, true]) {
      it(`retains an empty ${status} market with other keywords: ${populatedProject}`, async () => {
        const fixture = groupedFilterFixture();
        const targets = populatedProject ? fixture.targets.slice(0, 1) : [];
        await withGroupedFilterDatabase(
          "project_empty",
          [...fixture.locations, { ...emptyLocation, marketStatus: status }],
          targets,
          async (client) => {
            await client.query(`
              CREATE TEMP TABLE keyword_schedules ("keywordId" text, frequency text) ON COMMIT DROP;
              CREATE TEMP TABLE project_defaults ("projectId" text, frequency text) ON COMMIT DROP;
            `);
            mocks.hydrate.mockClear();
            mocks.queryRaw.mockImplementation(
              async (sql) => (await client.query(sql.text, sql.values)).rows,
            );
            const query = {
              ...defaultRankTrackerQueryState,
              lens: { device: "all" as const, locationId: emptyLocation.canonicalKey },
            };
            for (const grouped of [false, true]) {
              const input = { projectRef: "prj_empty", query: { ...query, grouped } };
              const result = await (grouped
                ? getRankTrackerGroupedList(input)
                : getRankTrackerKeywordList(input));
              expect(result.resolvedLens).toEqual(query.lens);
              expect(result).toMatchObject({
                matchedTargetCount: 0,
                page: 1,
                pageCount: 0,
                totalCount: targets.length,
              });
              expect(result.locations).toContainEqual({
                count: 0,
                displayName: "Spain",
                id: "ES:es",
                kind: "country",
              });
            }
            // Exact filters and bulk/export candidate scans must not widen an empty scope either.
            for (const statement of [
              buildRankTrackerListSql("project_empty", query, {
                candidatesOnly: true,
                publicIds: true,
                selectionLimit: 100,
              }),
              buildRankTrackerGroupedSql(
                "project_empty",
                { ...query, grouped: true },
                { candidatesOnly: true },
              ),
            ]) {
              const result = (await client.query(statement.text, statement.values)).rows[0];
              expect(result.matchedTargetCount).toBe(0);
              expect(result.keywordIds ?? result.groups).toEqual([]);
            }
            expect(mocks.hydrate).toHaveBeenCalledTimes(2);
            for (const call of mocks.hydrate.mock.calls) expect(call[1]).toEqual([]);
          },
        );
      });
    }
  }

  it("does not accept a location belonging only to another project", async () => {
    const fixture = groupedFilterFixture();
    await withGroupedFilterDatabase(
      "project_empty",
      fixture.locations,
      fixture.targets.slice(0, 1),
      async (client) => {
        await client.query(
          `INSERT INTO locations (id, "canonicalKey", "displayName", hl, kind) VALUES ('foreign', 'ES:es', 'Spain', 'es', 'country')`,
        );
        await client.query(
          `INSERT INTO project_markets ("projectId", "locationId", status) VALUES ('other_project', 'foreign', 'active')`,
        );
        const statement = buildRankTrackerGroupedSql("project_empty", {
          ...defaultRankTrackerQueryState,
          grouped: true,
          lens: { device: "all", locationId: "ES:es" },
        });
        const result = (await client.query(statement.text, statement.values)).rows[0];
        expect(result.locations.map((location: { id: string }) => location.id)).not.toContain(
          "ES:es",
        );
        expect(result.matchedTargetCount).toBe(1);
      },
    );
  });
});
