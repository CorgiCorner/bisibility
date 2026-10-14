import { randomUUID } from "node:crypto";
import { makePublicId } from "@/lib/db/public-id-resources";
import { localQuoteHash } from "@/lib/local-monitoring/quote";
import { describe, expect, it } from "vitest";
import { hostMeasurementDatabase } from "./host.postgres.test-fixture";

const suite = describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL);
suite("local project deletion requires an original native custody for every item", () => {
  it("rejects an orphan execution row when no native evidence loop has assigned a record", async () => {
    const f = await hostMeasurementDatabase();
    try {
      const target = await f.target(),
        input = f.launch([target]);
      const run = await f.db.localMeasurementRun.create({
        data: {
          publicId: makePublicId("lmr"),
          projectId: f.project.id,
          operation: "local_scan_submit",
          keyHash: "a".repeat(64),
          bodyHash: "b".repeat(64),
          actorId: f.writer.id,
          quote: input.quote,
          quoteHash: localQuoteHash(input.quote),
          expectedTargetKeys: [...input.quote.expectedTargetKeys],
          source: "app",
          trigger: "manual",
        },
      });
      const persistedTarget = await f.db.localMeasurementTarget.findFirstOrThrow({
        where: { projectId: f.project.id, publicId: target.id },
        select: { id: true },
      });
      // Deliberately invalid custody fixture: real FKs/checks, no fabricated Meter evidence or permit.
      await f.db.localMeasurementRunItem.create({
        data: {
          projectId: f.project.id,
          runId: run.id,
          targetId: persistedTarget.id,
          operationKey: randomUUID(),
          bodyHash: "c".repeat(64),
          record: { version: 0 },
          connectionId: f.connection.id,
          provider: f.connection.provider,
          credentialVersion: "synthetic-unadmitted",
          correlationId: randomUUID(),
          namespace: "test",
        },
      });
      expect(await f.db.meteringUsageEvidence.count()).toBe(0);
      await expect(f.db.project.delete({ where: { id: f.project.id } })).rejects.toThrow(
        "Original local execution proof is unavailable",
      );
      expect(await f.db.project.count()).toBe(1);
      expect(await f.db.localMeasurementRunItem.count()).toBe(1);
      expect(await f.db.meteringOperation.count()).toBe(0);
      expect(f.counters).toEqual({ submissions: 0, collections: 0 });
    } finally {
      await f.close();
    }
  }, 120_000);
});
