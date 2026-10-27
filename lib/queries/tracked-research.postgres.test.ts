import { makePublicId } from "@/lib/db/public-id";
import {
  canonicalKeywordResearchRequest,
  keywordResearchRequestKey,
} from "@/lib/keyword-research/request-key";
import { persistKeywordResearchSnapshot } from "@/lib/keyword-research/snapshot";
import { findStoredKeywordResearch } from "@/lib/keyword-research/stored-read";
import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import { reportPolicy } from "@/lib/rank-reports/report-test-fixture";
import { personalViewDatabase } from "@/lib/saved-views/postgres-test-fixture";
import { resolvedLocation } from "@/lib/test/fixtures/location";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getRankTrackerKeywordList } from "./rank-tracker-list";
import { exactRankTrackerRows } from "./rank-tracker-list-exact";
import { rankTrackerQualityFixture } from "./rank-tracker-report-test-fixture";
import { loadTrackedResearch } from "./tracked-research";

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    return holder.db;
  },
}));

describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)(
  "tracked Research persisted PostgreSQL snapshots",
  () => {
    let fixture: Awaited<ReturnType<typeof personalViewDatabase>>;
    let project: { id: string; publicId: string };
    let userId: string;
    let oldKey: string;
    let other: { id: string };
    let asOf: Date;
    const base = rankTrackerQualityFixture().row;
    const target = (id: string, keyword: string, gl = "us", hl = "en") => ({
      ...base,
      id,
      keyword,
      location: { ...base.location, gl, hl },
    });
    const researchRow = (keyword: string, volume: number | null) => ({
      alreadySaved: false,
      alreadyTracked: false,
      competition: null,
      cpcCents: volume === null ? null : volume * 10,
      difficulty: volume === null ? null : 20,
      intent: "commercial" as const,
      keyword,
      monthlyTrend: [{ year: 2026, month: 1, searchVolume: volume }],
      searchVolume: volume,
      source: "idea" as const,
    });
    async function save(
      projectId: string,
      seed: string,
      countryCode: string,
      languageCode: string,
      date: string,
      volume: number | null,
      keyword = "  BLUE   Widget ",
    ) {
      const request = canonicalKeywordResearchRequest({
        seed,
        countryCode,
        languageCode,
        mode: "ideas",
        resultLimit: 100,
        includeClickstream: false,
      });
      await persistKeywordResearchSnapshot({
        projectId,
        request,
        fetchedAt: new Date(date),
        freshUntil: new Date("2026-02-01T00:00:00Z"),
        outcome: {
          provider: "fixture",
          rows: [researchRow(keyword, volume)],
          sources: [{ cached: false, costCents: 0, returned: 1, source: "idea", status: "ok" }],
        },
      });
      return keywordResearchRequestKey(request);
    }
    beforeAll(async () => {
      fixture = await personalViewDatabase();
      holder.db = fixture.db;
      const user = await fixture.db.user.create({
        data: { publicId: makePublicId("usr"), email: "research@example.com", name: "Research" },
      });
      userId = user.id;
      project = await fixture.db.project.create({
        data: {
          publicId: makePublicId("prj"),
          ownerId: user.id,
          name: "One",
          domain: "example.com",
        },
      });
      await fixture.db.membership.create({
        data: { publicId: makePublicId("mbr"), projectId: project.id, userId, role: "admin" },
      });
      other = await fixture.db.project.create({
        data: {
          publicId: makePublicId("prj"),
          ownerId: user.id,
          name: "Two",
          domain: "example.org",
        },
      });
      oldKey = await save(project.id, "older", "US", "en", "2026-01-01T00:00:00Z", 7);
      await save(project.id, "newer", "US", "en", "2026-01-02T00:00:00Z", 40);
      await save(project.id, "polish", "PL", "pl", "2026-01-03T00:00:00Z", 11);
      await save(project.id, "language", "US", "es", "2026-01-03T00:00:00Z", 22);
      await save(other.id, "foreign", "US", "en", "2026-01-04T00:00:00Z", 999);
    }, 120_000);
    afterAll(async () => {
      await fixture?.close();
    });

    it("reads actual saved rows by project and country/language, choosing the latest valid row and retaining stale data", async () => {
      asOf = new Date(Date.now() + 1000);
      const targets = [
        target("us", " blue\twidget "),
        target("pl", "Blue Widget", "pl", "pl"),
        target("es", "BLUE widget", "us", "es"),
        {
          ...target("city", "Blue Widget"),
          location: { ...base.location, gl: "us", hl: "en", canonicalKey: "US/New York" },
        },
        target("missing", "absent"),
      ];
      const read = () => loadTrackedResearch(fixture.db, project.id, targets, asOf);
      const loaded = await read();
      expect(loaded.get("us")).toMatchObject({ volume: 40, cpc: 4, sourceSeed: "newer" });
      expect(loaded.get("city")?.volume).toBe(40);
      expect(loaded.get("pl")?.volume).toBe(11);
      expect(loaded.get("es")?.volume).toBe(22);
      expect(loaded.has("missing")).toBe(false);
      expect(
        (
          await loadTrackedResearch(
            fixture.db,
            project.id,
            targets,
            new Date("2026-01-01T00:00:00Z"),
          )
        ).size,
      ).toBe(0);
      expect(
        (await loadTrackedResearch(fixture.db, other.id, targets, asOf)).get("us")?.volume,
      ).toBe(999);
      expect([...(await read())]).toEqual([...loaded]);
      const stored = await findStoredKeywordResearch({
        projectId: project.id,
        requestKey: oldKey,
        now: asOf,
      });
      expect(stored).toMatchObject({
        stale: true,
        cached: true,
        rows: [expect.objectContaining({ keyword: "  BLUE   Widget ", searchVolume: 7 })],
      });
    });

    it("sorts persisted metrics across actual report pages before pagination", async () => {
      const location = await fixture.db.location.create({
        data: resolvedLocation({ id: "tracked-research-us" }),
      });
      const terms = Array.from(
        { length: 27 },
        (_, index) => `Page term ${String(index).padStart(2, "0")}`,
      );
      await fixture.db.keyword.createMany({
        data: terms.map((text) => ({
          publicId: makePublicId("kw"),
          projectId: project.id,
          text,
          location: location.displayName,
          locationId: location.id,
          device: "desktop",
        })),
      });
      const request = canonicalKeywordResearchRequest({
        seed: "page seed",
        countryCode: "US",
        languageCode: "en",
        mode: "ideas",
        resultLimit: 100,
        includeClickstream: false,
      });
      await persistKeywordResearchSnapshot({
        projectId: project.id,
        request,
        fetchedAt: new Date("2026-01-06T00:00:00Z"),
        freshUntil: new Date("2030-01-01T00:00:00Z"),
        outcome: {
          provider: "fixture",
          rows: terms.slice(0, 26).map((term, index) => researchRow(term, 25 - index)),
          sources: [{ cached: false, costCents: 0, returned: 26, source: "idea", status: "ok" }],
        },
      });
      const now = new Date(Date.now() + 1000);
      expect(
        await findStoredKeywordResearch({
          projectId: project.id,
          requestKey: keywordResearchRequestKey(request),
          now,
        }),
      ).toMatchObject({ stale: false, cached: true });
      const options = {
        asOf: now,
        context: { actor: { id: userId }, transport: "session" as const },
        db: fixture.db,
        limits: { maxChecks: 1000, maxItems: 1000, maxTargets: 1000 },
        policyAt: (at: Date) => ({
          ...reportPolicy(),
          asOf: at,
          baseline: {
            mode: "before" as const,
            before: new Date(at.getTime() - 7 * 86_400_000),
            notBefore: new Date(0),
          },
        }),
        loadMetadata: async () => new Map(),
        loadResearch: loadTrackedResearch,
      };
      const query = {
        ...defaultRankTrackerQueryState,
        pageSize: 25 as const,
        sort: { field: "researchVolume" as const, direction: "asc" as const },
      };
      const first = await getRankTrackerKeywordList(
        { projectRef: project.publicId, query },
        options,
      );
      const second = await getRankTrackerKeywordList(
        { projectRef: project.publicId, query: { ...query, page: 2 } },
        options,
      );
      expect(first.matchedTargetCount).toBe(27);
      expect(first.rows.map((row) => row.research?.volume)).toEqual(
        Array.from({ length: 25 }, (_, i) => i),
      );
      expect(second.rows.map((row) => row.research?.volume ?? null)).toEqual([25, null]);
      const again = await getRankTrackerKeywordList(
        { projectRef: project.publicId, query },
        options,
      );
      expect(again.rows.map((row) => row.research)).toEqual(first.rows.map((row) => row.research));
    });

    it("handles empty, malformed and null metrics and sorts loaded raw values before slicing pages", async () => {
      await save(project.id, "null", "US", "en", "2026-01-05T00:00:00Z", null, "Null term");
      await save(project.id, "zero", "US", "en", "2026-01-05T00:00:00Z", 0, "Zero term");
      await save(project.id, "hundred", "US", "en", "2026-01-05T00:00:00Z", 100, "Hundred term");
      const example = await fixture.db.keywordResearchSnapshot.findFirstOrThrow({
        where: { projectId: project.id },
      });
      const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...data } = example;
      await fixture.db.keywordResearchSnapshot.createMany({
        data: [
          {
            ...data,
            sources: [],
            requestKey: "empty-fixture",
            seed: "empty",
            rows: [],
            fetchedAt: new Date("2026-01-10T00:00:00Z"),
          },
          {
            ...data,
            sources: [],
            requestKey: "malformed-fixture",
            seed: "malformed",
            rows: [{ keyword: "Blue Widget" }],
            fetchedAt: new Date("2026-01-11T00:00:00Z"),
          },
        ],
      });
      const candidates = [
        target("unknown", "Missing term"),
        target("hundred", "Hundred term"),
        target("blue", "Blue Widget"),
        target("zero", "Zero term"),
        target("null", "Null term"),
      ];
      const loaded = await loadTrackedResearch(
        fixture.db,
        project.id,
        candidates,
        new Date(Date.now() + 1000),
      );
      expect(loaded.get("blue")?.volume).toBe(40);
      expect(loaded.get("null")).toMatchObject({ volume: null, difficulty: null, cpc: null });
      const rows = candidates.map((row) => ({ ...row, research: loaded.get(row.id) ?? null }));
      const sorted = exactRankTrackerRows(rows, {
        ...defaultRankTrackerQueryState,
        sort: { field: "researchVolume", direction: "asc" },
      });
      expect(sorted.slice(0, 2).map(({ id }) => id)).toEqual(["zero", "blue"]);
      expect(sorted.slice(2).map(({ id }) => id)).toEqual(["hundred", "unknown", "null"]);
      expect(
        exactRankTrackerRows(rows, {
          ...defaultRankTrackerQueryState,
          sort: { field: "researchCpc", direction: "desc" },
        }).map(({ id }) => id),
      ).toEqual(["hundred", "blue", "zero", "unknown", "null"]);
    });
  },
);
