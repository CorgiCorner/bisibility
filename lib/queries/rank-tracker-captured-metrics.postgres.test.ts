import { makePublicId } from "@/lib/db/public-id";
import { currentDefinitionMetadataLoader } from "@/lib/measurement-definitions/query-adapter";
import { rankReportTestDatabase } from "@/lib/rank-reports/postgres-test-fixture";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadCapturedRankTrackerMetrics } from "./rank-tracker-captured-metrics";

vi.mock("server-only", () => ({}));

describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)(
  "captured numeric metrics in the report snapshot",
  () => {
    let f: Awaited<ReturnType<typeof rankReportTestDatabase>>;
    let snapshotAt: Date;
    beforeAll(async () => {
      f = await rankReportTestDatabase();
      const result = await f.client.query<{ asOf: Date }>('SELECT clock_timestamp() AS "asOf"');
      snapshotAt = result.rows[0].asOf;
    }, 120_000);
    afterAll(async () => {
      await f?.close();
    });
    beforeEach(async () => {
      await f.db.rankCheck.updateMany({
        where: { keywordId: f.keyword.id },
        data: { raw: {}, updatedAt: new Date("2026-10-12T10:03:00Z") },
      });
    });
    async function read() {
      return f.db.$transaction(
        async (tx) => {
          await tx.$executeRaw`SET TRANSACTION READ ONLY`;
          const targets = [{ id: f.keyword.id, publicId: f.keyword.publicId }];
          const metadata = await currentDefinitionMetadataLoader(f.context, {
            cadenceIntervalMs: async () => null,
          })(tx, f.project, targets, snapshotAt);
          return loadCapturedRankTrackerMetrics(tx, f.project.id, targets, metadata, snapshotAt);
        },
        { isolationLevel: "RepeatableRead" },
      );
    }
    it("keeps numeric metadata and zero volume while omitting historical feature unions", async () => {
      await f.db.rankCheck.update({
        where: { id: f.checkIds[100] },
        data: {
          raw: {
            volume: 0,
            cpc: 2.5,
            keyword_difficulty: 0.6,
            serp_features: ["local_pack"],
            privateHeader: "must-not-be-returned",
          },
          updatedAt: new Date("2026-10-12T10:03:00Z"),
        },
      });
      expect((await read()).get(f.keyword.publicId)).toEqual({
        volume: 0,
        cpc: 2.5,
        difficulty: 60,
        serpFeatures: [],
      });
    });
    it("does not use a later uncaptured check or changes beyond the snapshot watermark", async () => {
      await f.db.rankCheck.update({
        where: { id: f.checkIds[100] },
        data: { raw: { volume: 100 }, updatedAt: new Date("2026-10-12T10:03:00Z") },
      });
      await f.db.rankCheck.create({
        data: {
          keywordId: f.keyword.id,
          publicId: makePublicId("check"),
          provider: "synthetic",
          status: "completed",
          raw: { volume: 999 },
          createdAt: new Date(snapshotAt.getTime() + 1000),
          updatedAt: new Date(snapshotAt.getTime() + 1000),
        },
      });
      expect((await read()).get(f.keyword.publicId)?.volume).toBe(100);
      await f.db.rankCheck.update({
        where: { id: f.checkIds[100] },
        data: { raw: { volume: 999 }, updatedAt: new Date(snapshotAt.getTime() + 1000) },
      });
      expect((await read()).get(f.keyword.publicId)?.volume).toBeNull();
    });
    it("keeps invalid negative volume and CPC unknown instead of using them as weights", async () => {
      await f.db.rankCheck.update({
        where: { id: f.checkIds[100] },
        data: { raw: { volume: -1, cpc: -3 }, updatedAt: new Date("2026-10-12T10:03:00Z") },
      });
      expect((await read()).get(f.keyword.publicId)).toMatchObject({ volume: null, cpc: null });
    });
  },
);
