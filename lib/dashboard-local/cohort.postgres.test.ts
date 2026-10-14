import { randomUUID } from "node:crypto";
import { assignBusinessLocationFor } from "@/lib/business-location-store/assignment-write";
import {
  type BusinessPgFixture,
  businessLocationDatabase,
} from "@/lib/business-location-store/postgres.test-fixture";
import { makePublicId } from "@/lib/db/public-id-resources";
import { overviewComparisonDays } from "@/lib/queries/overview-filters";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalReadFilters } from "./model";
import { localDashboardFixture } from "./postgres.test-fixture";
import { readLocalReportInTransaction } from "./read";
import { dashboardLocalSelectionSchema } from "./selection";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/audit", async (original) => ({
  ...(await original<typeof import("@/lib/auth/audit")>()),
  writeAuditFailure: vi.fn(async () => undefined),
}));

describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)(
  "Local full market cohort and budget",
  () => {
    let db: BusinessPgFixture;
    let fixture: Awaited<ReturnType<typeof localDashboardFixture>>;
    let selection: ReturnType<typeof dashboardLocalSelectionSchema.parse>;
    beforeAll(async () => {
      db = await businessLocationDatabase();
    }, 120000);
    afterAll(async () => {
      await db?.close();
    });
    beforeEach(async () => {
      fixture = await localDashboardFixture(db);
      const market = await db.db.projectMarket.create({
        data: {
          projectId: fixture.project.id,
          locationId: fixture.observed.location.id,
          publicId: makePublicId("pmkt"),
          name: "Local market",
          status: "active",
        },
      });
      await db.db.keyword.create({
        data: {
          projectId: fixture.project.id,
          publicId: makePublicId("kw"),
          text: "Second target",
          device: "mobile",
          location: "Synthetic",
          locationId: fixture.observed.location.id,
        },
      });
      await assignBusinessLocationFor(
        {
          projectId: fixture.project.publicId,
          scope: { kind: "market", id: market.publicId },
          target: fixture.target,
          expectedRevision: 0,
          reason: "Market fixture",
          idempotencyKey: randomUUID(),
        },
        fixture.writerContext,
        db.db,
      );
      selection = dashboardLocalSelectionSchema.parse({
        ...fixture.target,
        assignmentRevision: 1,
        scope: { kind: "market", id: market.publicId },
      });
    });
    async function read(maxTargets = 100, selected: Partial<LocalReadFilters> = {}) {
      const filters: LocalReadFilters = {
        device: "all",
        range: "90d",
        marketIds: [],
        tag: null,
        ...selected,
      };
      const options = fixture.reportOptions(overviewComparisonDays(filters.range));
      options.limits.maxTargets = maxTargets;
      return db.db.$transaction(
        async (tx) => {
          await tx.$executeRaw`SET TRANSACTION READ ONLY`;
          return readLocalReportInTransaction(
            tx,
            fixture.project.publicId,
            fixture.ownerContext,
            selection,
            filters,
            options,
          );
        },
        { isolationLevel: "RepeatableRead" },
      );
    }
    it("canonical market/device and 7/28/90 periods keep the exact cohort without paid I/O", async () => {
      const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("Read must not call a provider"));
      try {
        const canonicalLocationKey = fixture.observed.location.canonicalKey;
        for (const range of ["7d", "28d", "90d"] as const) {
          const mobile = await read(100, { device: "mobile", canonicalLocationKey, range });
          const desktop = await read(100, { device: "desktop", canonicalLocationKey, range });
          expect(mobile.expected).toBe(1);
          expect(mobile.retainedChecks).toBe(0);
          expect(mobile.targetTop3.counts.neverChecked).toBe(1);
          expect(desktop.expected).toBe(1);
          expect(desktop.rows.map((row) => row.keywordId)).toEqual([
            fixture.observed.keyword.publicId,
          ]);
          expect(desktop.retainedChecks).toBe(1);
          expect(desktop.targetTop3.counts.comparable).toBe(0);
          expect(desktop.targetTop3.delta).toBeNull();
        }
        const unrelated = await read(100, { canonicalLocationKey: "absent-canonical-market" });
        expect(unrelated.expected).toBe(0);
        expect(unrelated.rows).toEqual([]);
        expect(unrelated.retainedChecks).toBe(0);
        expect(fetch).not.toHaveBeenCalled();
      } finally {
        fetch.mockRestore();
      }
    });
    it("reads the entire market, with explicit keyword unassignment overriding inheritance", async () => {
      expect((await read()).expected).toBe(2);
      await assignBusinessLocationFor(
        {
          projectId: fixture.project.publicId,
          scope: fixture.selection.scope,
          target: null,
          expectedRevision: 1,
          reason: "Keyword does not inherit",
          idempotencyKey: randomUUID(),
        },
        fixture.writerContext,
        db.db,
      );
      const result = await read();
      expect(result.expected).toBe(1);
      expect(result.excluded).toBe(1);
      expect(result.rows.map((row) => row.keywordId)).not.toContain(
        fixture.observed.keyword.publicId,
      );
    });
    it("fails the whole read with 413 rather than returning first-page totals", async () => {
      await expect(read(1)).rejects.toMatchObject({ status: 413 });
      expect((await read()).expected).toBe(2);
    });
    it("excludes archived targets but a paused execution schedule retains cohort membership", async () => {
      await db.db.keywordSchedule.create({
        data: { keywordId: fixture.observed.keyword.id, frequency: "paused", timezone: "UTC" },
      });
      expect((await read()).expected).toBe(2);
      await db.db.keyword.update({
        where: { id: fixture.observed.keyword.id },
        data: { archivedAt: new Date() },
      });
      expect((await read()).expected).toBe(1);
    });
    it("a paused market denies the selected cohort instead of falling back to General", async () => {
      await db.db.projectMarket.updateMany({
        where: { projectId: fixture.project.id },
        data: { status: "paused" },
      });
      await expect(read()).rejects.toMatchObject({ status: 409 });
    });
  },
);
