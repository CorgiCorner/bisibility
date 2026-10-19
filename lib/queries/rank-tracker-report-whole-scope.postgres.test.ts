import { AuthorizationError } from "@/lib/auth/authorize";
import { makePublicId } from "@/lib/db/public-id";
import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import { readCurrentDefinitionsInTransaction } from "@/lib/measurement-definitions/reader";
import { rankReportTestDatabase } from "@/lib/rank-reports/postgres-test-fixture";
import { reportAsOf, reportPolicy } from "@/lib/rank-reports/report-test-fixture";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getRankTrackerGroupedList } from "./rank-tracker-grouped-list";
import { getRankTrackerKeywordList } from "./rank-tracker-list";
import type {
  RankTrackerReportMetadata,
  RankTrackerReportOptions,
} from "./rank-tracker-report-model";
import { selectRankTrackerReportKeywords } from "./rank-tracker-report-selection";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/audit", () => ({ writeAuditFailure: vi.fn(async () => ({})) }));

describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)(
  "rank tracker actual whole-filter current-quality oracle",
  () => {
    // The report instant is pinned so the default 7-day comparison cutoff (2026-10-07T12:00Z)
    // always falls between the 2026-09-30 baseline and the 2026-10-12 current checks. A
    // wall-clock asOf moved that cutoff past the current checks from 2026-10-19T10:01Z onward.
    const reportAt = new Date("2026-10-14T12:00:00.000Z");
    let fixture: Awaited<ReturnType<typeof rankReportTestDatabase>>;
    let extraIds: string[];
    // Definition heads are captured with the database clock_timestamp(), so they can only be
    // read at an instant after fixture setup, never at the pinned historical report instant.
    let definitionsAt: Date;
    beforeAll(async () => {
      fixture = await rankReportTestDatabase(101, true);
      const extras = Array.from({ length: 102 }, (_, i) => ({
        createdAt: new Date("2026-01-01T00:00:00Z"),
        device: "desktop" as const,
        location: "Krakow",
        locationId: "report-location",
        projectId: fixture.project.id,
        publicId: makePublicId("kw"),
        text: i === 0 ? "Service" : `Term ${i}`,
      }));
      await fixture.db.keyword.createMany({ data: extras });
      extraIds = extras.map(({ publicId }) => publicId);
      await fixture.db.rankCheck.updateMany({
        data: {
          rankingUrl: "https://example.test/same",
          updatedAt: new Date("2026-10-12T11:00:00Z"),
        },
        where: { keywordId: fixture.keyword.id },
      });
      const oldId = fixture.checkIds[0];
      if (!oldId) throw new Error("Missing prior-period baseline fixture");
      const baselineDate = new Date("2026-09-30T10:01:00Z");
      await fixture.db.rankCheck.update({
        data: {
          checkedAt: baselineDate,
          createdAt: baselineDate,
          position: 3,
          rankingUrl: "https://example.test/older-than-100-rechecks",
          updatedAt: baselineDate,
        },
        where: { id: oldId },
      });
      const original = await fixture.db.observationRun.findUniqueOrThrow({
        where: { rankCheckId: oldId },
      });
      if (
        !original.requestPolicy ||
        typeof original.requestPolicy !== "object" ||
        Array.isArray(original.requestPolicy)
      )
        throw new Error("Actual captured request policy is unavailable.");
      const evidence = original.requestPolicy.evidence;
      if (!evidence || typeof evidence !== "object" || Array.isArray(evidence))
        throw new Error("Actual captured revision proof is unavailable.");
      await fixture.db.observationRun.update({
        data: {
          createdAt: baselineDate,
          executedAt: baselineDate,
          requestPolicy: {
            ...original.requestPolicy,
            evidence: { ...evidence, observedAt: "2026-09-30T10:00:00Z" },
          },
        },
        where: { rankCheckId: oldId },
      });
      definitionsAt = new Date();
    }, 60000);
    afterAll(async () => {
      await fixture?.close();
    });

    function options(): RankTrackerReportOptions {
      return {
        asOf: reportAt,
        context: fixture.context,
        db: fixture.db,
        limits: { maxChecks: 1000, maxItems: 1000, maxTargets: 1000 },
        policyAt: (asOf) => ({
          ...reportPolicy(),
          asOf,
          baseline: {
            notBefore: new Date("2026-09-01T00:00:00.000Z"),
            mode: "before" as const,
            before: new Date(asOf.getTime() - 7 * 86_400_000),
          },
        }),
        loadMetadata: async (tx, project, targets) => {
          const actual = await readCurrentDefinitionsInTransaction(
            tx,
            fixture.context,
            project.publicId,
            targets.map(({ publicId }) => publicId),
            definitionsAt,
            { cadenceIntervalMs: async () => null },
          );
          return new Map([...actual].map(([id, value]) => [id, { ...value, volume: 100 }]));
        },
      };
    }
    const input = () => ({
      projectRef: fixture.project.publicId,
      query: defaultRankTrackerQueryState,
    });

    it("keeps all 103 filtered IDs and current metric counts identical for 25/50 flat pages and grouped pages", async () => {
      const small = await getRankTrackerKeywordList(
        { ...input(), query: { ...input().query, pageSize: 25 } },
        options(),
      );
      const large = await getRankTrackerKeywordList(
        { ...input(), query: { ...input().query, pageSize: 50 } },
        options(),
      );
      const grouped = await getRankTrackerGroupedList(
        { ...input(), query: { ...input().query, grouped: true, pageSize: 25 } },
        options(),
      );
      expect(small.rows).toHaveLength(25);
      expect(large.rows).toHaveLength(50);
      expect(small.selectedKeywordIds).toHaveLength(103);
      expect(grouped.selectedKeywordIds).toEqual(small.selectedKeywordIds);
      expect(small.report).toEqual(large.report);
      expect(grouped.report).toEqual(small.report);
      expect(small.report?.metric).toMatchObject({
        counts: { comparable: 1, expected: 103, neverChecked: 102, ranked: 1 },
        delta: 40,
        value: 50,
      });
      expect(grouped.matchedTargetCount).toBe(103);
      expect(grouped.matchedGroupCount).toBe(102);
    });
    it("resolves movement and historical URL changes beyond 100 same-day rechecks before both filters and LIMIT", async () => {
      const query = {
        ...defaultRankTrackerQueryState,
        search: "service",
        filters: {
          ...defaultRankTrackerQueryState.filters,
          change: "up" as const,
          urlChanged: true,
        },
      };
      const flat = await getRankTrackerKeywordList({ ...input(), query }, options());
      const grouped = await getRankTrackerGroupedList(
        { ...input(), query: { ...query, grouped: true } },
        options(),
      );
      expect(flat.selectedKeywordIds).toEqual([fixture.keyword.publicId]);
      expect(grouped.selectedKeywordIds).toEqual(flat.selectedKeywordIds);
      expect(flat.rows).toMatchObject([
        {
          positionBaseline: 3,
          rankingPages: 2,
          rankQuality: { current: { position: 2 }, movement: 1 },
        },
      ]);
      expect(flat.report?.metric).toMatchObject({
        counts: { comparable: 1, expected: 1 },
        delta: 40,
      });
    });
    it("retains General/history while current-revision proof is unavailable without importing history into current KPI", async () => {
      const unavailable = {
        ...options(),
        loadMetadata: async () => new Map<string, RankTrackerReportMetadata>(),
      };
      const selected = await selectRankTrackerReportKeywords(fixture.context, input(), unavailable);
      expect(selected.report.metric).toMatchObject({
        counts: { expected: 103, metricEligible: 0, unknown: 1 },
        value: null,
        delta: null,
      });
      const checked = selected.rows.find(({ id }) => id === fixture.keyword.publicId);
      expect(checked?.rankQuality).toMatchObject({
        current: { evidence: "unknown", reason: "current_scope_unavailable" },
        currentScopeState: "unavailable",
        lastKnown: { current: { position: 2 } },
      });
      expect(checked?.sparkline).toHaveLength(101);
    });
    it("keeps a stale market empty and refuses oversized history rather than returning a partial summary", async () => {
      const stale = await getRankTrackerKeywordList(
        {
          ...input(),
          query: { ...input().query, lens: { device: "all", locationId: "not-retained" } },
        },
        options(),
      );
      expect(stale).toMatchObject({
        matchedTargetCount: 0,
        resolvedLens: { locationId: "not-retained" },
        selectedKeywordIds: [],
        report: { metric: { counts: { expected: 0 }, value: null } },
      });
      await expect(
        getRankTrackerKeywordList(input(), {
          ...options(),
          limits: { maxChecks: 100, maxItems: 1000, maxTargets: 1000 },
        }),
      ).rejects.toMatchObject({ status: 413 });
      await expect(
        getRankTrackerKeywordList(input(), {
          ...options(),
          limits: { maxChecks: 1000, maxItems: 1000, maxTargets: 100 },
        }),
      ).rejects.toMatchObject({ status: 413 });
    });
    it("isolates callback argument mutations from the owned project and authorized target snapshot", async () => {
      const selected = await selectRankTrackerReportKeywords(fixture.context, input(), {
        ...options(),
        loadMetadata: async (_tx, project, targets) => {
          project.id = "synthetic-callback-mutation";
          const target = targets[0];
          if (target) target.id = "synthetic-callback-mutation";
          return new Map<string, RankTrackerReportMetadata>();
        },
      });
      expect(selected.selectedKeywordIds).toHaveLength(103);
      expect(selected.project.id).toBe(fixture.project.id);
      expect(
        selected.rows.find(({ id }) => id === fixture.keyword.publicId)?.rankQuality.lastKnown
          .lastSuccess,
      ).toMatchObject({ position: 2 });
    });
    it("separates paused execution from paused market/archived membership without deleting retained checks", async () => {
      await fixture.db.keywordSchedule.create({
        data: { frequency: "paused", keywordId: fixture.keyword.id, timezone: "UTC" },
      });
      try {
        const retained = await getRankTrackerKeywordList(input(), options());
        const excluded = await getRankTrackerKeywordList(input(), {
          ...options(),
          pausedSchedules: "exclude",
        });
        expect(retained.matchedTargetCount).toBe(103);
        expect(excluded.matchedTargetCount).toBe(102);
      } finally {
        await fixture.db.keywordSchedule.delete({ where: { keywordId: fixture.keyword.id } });
      }
      const archiveId = extraIds[1];
      if (!archiveId) throw new Error("Missing archived target fixture");
      await fixture.db.keyword.update({
        data: { archivedAt: reportAsOf },
        where: { publicId: archiveId },
      });
      try {
        expect((await getRankTrackerKeywordList(input(), options())).matchedTargetCount).toBe(102);
      } finally {
        await fixture.db.keyword.update({
          data: { archivedAt: null },
          where: { publicId: archiveId },
        });
      }
      const market = await fixture.db.projectMarket.create({
        data: {
          locationId: "report-location",
          projectId: fixture.project.id,
          publicId: makePublicId("pmkt"),
          status: "paused",
        },
      });
      try {
        expect((await getRankTrackerKeywordList(input(), options())).matchedTargetCount).toBe(0);
      } finally {
        await fixture.db.projectMarket.delete({ where: { id: market.id } });
      }
      expect(await fixture.db.rankCheck.count({ where: { keywordId: fixture.keyword.id } })).toBe(
        101,
      );
    });
    for (const status of ["active", "paused"] as const) {
      for (const populatedProject of [false, true]) {
        it(`retains an empty ${status} market with other keywords: ${populatedProject}`, async () => {
          const db = fixture.db;
          const original = await db.location.findUniqueOrThrow({
            where: { id: "report-location" },
          });
          const empty = await db.location.create({
            data: {
              ...original,
              id: `report-empty-${status}-${populatedProject}`,
              canonicalKey: "ES:es",
              displayName: "Spain",
              kind: "country",
              countryCode: "ES",
              cityName: null,
              regionCode: null,
              gl: "es",
              hl: "es",
              languageCode: "es",
              languageLabel: "Spanish",
              primaryGeoCode: null,
              primaryGeoName: "Spain",
              secondaryGeoName: "Spain",
            },
          });
          const market = await db.projectMarket.create({
            data: {
              publicId: makePublicId("pmkt"),
              projectId: fixture.project.id,
              locationId: empty.id,
              status,
            },
          });
          if (!populatedProject)
            await db.keyword.updateMany({
              where: { projectId: fixture.project.id },
              data: { archivedAt: reportAsOf },
            });
          try {
            const counts: number[] = [];
            for (const grouped of [false, true]) {
              const query = {
                ...defaultRankTrackerQueryState,
                grouped,
                lens: { device: "all" as const, locationId: empty.canonicalKey },
              };
              const result = grouped
                ? await getRankTrackerGroupedList({ ...input(), query }, options())
                : await getRankTrackerKeywordList({ ...input(), query }, options());
              expect(result.resolvedLens).toEqual(query.lens);
              expect(result).toMatchObject({
                matchedTargetCount: 0,
                page: 1,
                pageCount: 0,
                selectedKeywordIds: [],
                totalCount: populatedProject ? 103 : 0,
                report: { metric: { counts: { expected: 0 }, value: null } },
              });
              expect(result.locations).toContainEqual({
                count: 0,
                displayName: "Spain / Spanish",
                id: "ES:es",
                kind: "country",
              });
              counts.push(result.report?.metric.counts.expected ?? -1);
            }
            expect(counts).toEqual([0, 0]);
            const general = await getRankTrackerKeywordList(input(), options());
            expect(general.report?.metric.counts.expected).toBe(populatedProject ? 103 : 0);
          } finally {
            if (!populatedProject)
              await db.keyword.updateMany({
                where: { projectId: fixture.project.id },
                data: { archivedAt: null },
              });
            await db.projectMarket.delete({ where: { id: market.id } });
            await db.location.delete({ where: { id: empty.id } });
          }
        });
      }
    }
    it("renews membership rather than trusting cached actor access on list reads", async () => {
      await fixture.db.membership.delete({
        where: {
          userId_projectId: { projectId: fixture.project.id, userId: fixture.context.actor.id },
        },
      });
      await expect(getRankTrackerKeywordList(input(), options())).rejects.toBeInstanceOf(
        AuthorizationError,
      );
    });
  },
);
