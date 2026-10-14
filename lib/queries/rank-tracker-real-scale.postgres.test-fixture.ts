import { makePublicId } from "@/lib/db/public-id";
import { defaultRankTrackerReportScope } from "@/lib/keywords/rank-tracker-report-scope";
import { readCurrentDefinitionsInTransaction } from "@/lib/measurement-definitions/reader";
import { rankReportTestDatabase } from "@/lib/rank-reports/postgres-test-fixture";
import { reportPolicy } from "@/lib/rank-reports/report-test-fixture";
import type { RankTrackerReportOptions } from "./rank-tracker-report-model";

/** Actual immutable capture and full-schema reads; no provider or paid admission. */
export async function realScaleFixture() {
  let queries = 0;
  const f = await rankReportTestDatabase(1, true, () => queries++);
  try {
    const keywords = [f.keyword];
    for (let index = 1; index < 120; index++) {
      const keyword = await f.db.keyword.create({
        data: {
          createdAt: new Date("2026-01-01T00:00:00Z"),
          device: "mobile",
          location: f.keyword.location,
          locationId: f.keyword.locationId,
          projectId: f.project.id,
          publicId: makePublicId("kw"),
          text: `Scale ${String(index).padStart(4, "0")}`,
        },
      });
      keywords.push(keyword);
      await f.capturedCheck(keyword, new Date("2026-10-12T10:01:00Z"));
    }
    for (const [index, keyword] of keywords.slice(0, 60).entries())
      await f.capturedCheck(keyword, new Date("2026-09-30T10:01:00Z"), index < 11 ? 3 : 2);
    const metadataBatches: number[] = [];
    function options(): RankTrackerReportOptions {
      const asOf = new Date();
      return {
        asOf,
        context: f.context,
        db: f.db,
        limits: { maxChecks: 1000, maxItems: 1000, maxTargets: 2500 },
        policyAt: (time) => ({
          ...reportPolicy(),
          asOf: time,
          baseline: {
            mode: "before",
            notBefore: new Date("2026-09-01T00:00:00Z"),
            before: new Date(
              time.getTime() - defaultRankTrackerReportScope.comparisonDays * 86_400_000,
            ),
          },
        }),
        loadMetadata: async (tx, project, targets, time) => {
          metadataBatches.push(targets.length);
          const metadata = await readCurrentDefinitionsInTransaction(
            tx,
            f.context,
            project.publicId,
            targets.map(({ publicId }) => publicId),
            time,
            { cadenceIntervalMs: async () => null },
          );
          return new Map([...metadata].map(([id, value]) => [id, { ...value, volume: 100 }]));
        },
      };
    }
    function resetReads() {
      queries = 0;
      metadataBatches.length = 0;
    }
    const readings = () => ({ queries, metadataBatches: [...metadataBatches] });
    async function expand() {
      await f.db.keyword.createMany({
        data: Array.from({ length: 1881 }, (_, index) => ({
          createdAt: new Date("2026-01-01T00:00:00Z"),
          device: "mobile" as const,
          location: f.keyword.location,
          locationId: f.keyword.locationId,
          projectId: f.project.id,
          publicId: makePublicId("kw"),
          text: `Unmeasured ${String(index).padStart(4, "0")}`,
        })),
      });
    }
    return { ...f, expand, keywords, options, readings, resetReads };
  } catch (error) {
    await f.close();
    throw error;
  }
}
