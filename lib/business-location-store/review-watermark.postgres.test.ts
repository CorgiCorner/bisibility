import { randomUUID } from "node:crypto";
import { matchBusinessCollection } from "@/lib/business-locations/match";
import { planAutomaticMatch } from "@/lib/business-locations/match-decisions";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { businessDigest } from "./canonical";
import { readBusinessLocationFor } from "./location-read";
import { createBusinessLocationFor } from "./location-write";
import { appendStoredMatch } from "./match-repository";
import {
  projectRetainedBusinessObservation,
  retainedBusinessObservationSelect,
} from "./observation-read";
import {
  type BusinessPgFixture,
  businessLocationDatabase,
  identityCommand,
  seedBusinessProject,
  seedRetainedObservation,
} from "./postgres.test-fixture";
import { readBusinessReviewContext } from "./review-context";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/audit", async (original) => ({
  ...(await original<typeof import("@/lib/auth/audit")>()),
  writeAuditFailure: vi.fn(async () => undefined),
}));
describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)(
  "retained decision watermark SQL",
  () => {
    let fixture: BusinessPgFixture;
    beforeAll(async () => {
      fixture = await businessLocationDatabase();
    }, 120000);
    afterAll(async () => {
      await fixture?.close();
    });
    it("excludes a later appended decision until explicit refresh, preserving original observed time and source", async () => {
      const scope = await seedBusinessProject(fixture);
      const retained = await seedRetainedObservation(fixture, scope.project.id);
      const saved = await createBusinessLocationFor(
        identityCommand(scope.project.publicId),
        scope.writerContext,
        fixture.db,
      );
      if (saved.receipt.kind !== "identity") throw new Error("Expected identity");
      const locationId = saved.receipt.publicId;
      const location = (
        await readBusinessLocationFor(
          scope.project.publicId,
          locationId,
          scope.writerContext,
          fixture.db,
        )
      ).location;
      const original = await readBusinessReviewContext(
        scope.project.publicId,
        locationId,
        retained.run.id,
        scope.writerContext,
        fixture.db,
      );
      expect(original.decisions).toEqual([]);
      const run = await fixture.db.observationRun.findUniqueOrThrow({
        where: { id: retained.run.id },
        select: retainedBusinessObservationSelect,
      });
      const projected = projectRetainedBusinessObservation(run);
      const [{ recordedAt }] = (
        await fixture.client.query<{ recordedAt: Date }>('SELECT clock_timestamp() AS "recordedAt"')
      ).rows;
      expect(recordedAt.getTime()).toBeGreaterThan(Date.parse(original.watermark));
      const evaluation = matchBusinessCollection({
        projectId: scope.project.id,
        observationRunId: run.id,
        targets: [location.currentRevision],
        items: projected.items,
      })[0];
      const decision = planAutomaticMatch({
        id: randomUUID(),
        evaluation,
        current: null,
        expectedDecisionRevision: 0,
        context: {
          actorId: scope.writer.id,
          projectId: scope.project.id,
          canWrite: true,
          writeMode: "editable",
        },
        recordedAt: recordedAt.toISOString(),
        idempotencyKey: randomUUID(),
      }).decision;
      await fixture.db.$transaction(async (tx) => {
        const head = await tx.businessMatchHead.create({
          data: {
            projectId: scope.project.id,
            entityId: location.id,
            observationRunId: run.id,
            itemId: retained.item.id,
          },
        });
        await appendStoredMatch(
          tx,
          head,
          decision,
          projected.sourceByItem.get(retained.item.id)!,
          businessDigest(projected.items[0]),
        );
      });
      const frozen = await readBusinessReviewContext(
        scope.project.publicId,
        locationId,
        run.id,
        scope.writerContext,
        fixture.db,
        { cursor: original.cursor },
      );
      expect(frozen.decisions).toEqual([]);
      expect(frozen.expectedDecisions[0].expectedRevision).toBe(0);
      const refreshed = await readBusinessReviewContext(
        scope.project.publicId,
        locationId,
        run.id,
        scope.writerContext,
        fixture.db,
        { cursor: original.cursor, mode: "refresh" },
      );
      expect(refreshed.decisions).toHaveLength(1);
      expect(refreshed.decisions[0]).toMatchObject({
        source: "automatic",
        observedAt: "2026-10-01T10:00:00.000Z",
        recordedAt: recordedAt.toISOString(),
        matcherVersion: decision.matcherVersion,
      });
      expect(refreshed.expectedDecisions[0].expectedRevision).toBe(1);
      expect(refreshed.watermark).not.toBe(original.watermark);
    });
  },
);
