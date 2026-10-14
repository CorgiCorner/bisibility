import { randomUUID } from "node:crypto";
import { Prisma } from "@/lib/generated/prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readBusinessLocationFor } from "./location-read";
import { createBusinessLocationFor } from "./location-write";
import { readBusinessMatchesFor } from "./match-read";
import { rematchBusinessLocationFor, reviewBusinessCandidateFor } from "./match-write";
import {
  type BusinessPgFixture,
  businessLocationDatabase,
  identityCommand,
  seedBusinessProject,
  seedRetainedObservation,
} from "./postgres.test-fixture";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/audit", async (original) => ({
  ...(await original<typeof import("@/lib/auth/audit")>()),
  writeAuditFailure: vi.fn(async () => undefined),
}));
describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)(
  "retained-data business matching on full migrations",
  () => {
    let fixture: BusinessPgFixture;
    let scope: Awaited<ReturnType<typeof seedBusinessProject>>;
    beforeAll(async () => {
      fixture = await businessLocationDatabase();
    }, 120000);
    afterAll(async () => {
      await fixture?.close();
    });
    beforeEach(async () => {
      scope = await seedBusinessProject(fixture);
    });
    async function location(cid?: string) {
      const result = await createBusinessLocationFor(
        identityCommand(scope.project.publicId, cid),
        scope.writerContext,
        fixture.db,
      );
      if (result.receipt.kind !== "identity") throw new Error("Expected identity");
      return (
        await readBusinessLocationFor(
          scope.project.publicId,
          result.receipt.publicId,
          scope.writerContext,
          fixture.db,
        )
      ).location;
    }
    function rematchInput(
      entity: Awaited<ReturnType<typeof location>>,
      observed: Awaited<ReturnType<typeof seedRetainedObservation>>,
      revision = 0,
    ) {
      return {
        projectId: scope.project.publicId,
        locationId: entity.publicId,
        identityRevisionId: entity.currentRevision.id,
        observationRunId: observed.run.id,
        expectedDecisions: [{ itemId: observed.item.id, expectedRevision: revision }],
        idempotencyKey: randomUUID(),
      };
    }
    async function latest(entity: Awaited<ReturnType<typeof location>>, runId: string) {
      return (
        await readBusinessMatchesFor(
          scope.project.publicId,
          entity.publicId,
          runId,
          scope.writerContext,
          fixture.db,
        )
      ).decisions.at(-1)!;
    }
    it("keeps two same-domain branches at their own strong-ID slots without raw or provider HTTP", async () => {
      const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("Rematch must not use HTTP"));
      try {
        const a = await location("18446744073709551615");
        await location("12345678901234567890");
        const observed = await seedRetainedObservation(fixture, scope.project.id, {
          cid: "12345678901234567890",
        });
        await fixture.db.observationItem.update({
          where: { id: observed.item.id },
          data: { positionInBlock: 1, rawFragment: Prisma.JsonNull },
        });
        const exact = await fixture.db.observationItem.create({
          data: {
            observationRunId: observed.run.id,
            resultKind: "local_pack",
            ordinal: 1,
            positionInBlock: 3,
            blockPosition: 1,
            promotion: "organic",
            rankScale: "pack_slot",
            sourcePage: 1,
            sourceOrdinal: 1,
            observedAt: new Date("2026-10-01T10:00:00.000Z"),
            businessName: "Żółta firma",
            domain: "example.test",
            cid: "18446744073709551615",
            rawFragment: Prisma.JsonNull,
          },
        });
        await rematchBusinessLocationFor(
          {
            ...rematchInput(a, observed),
            expectedDecisions: [
              { itemId: observed.item.id, expectedRevision: 0 },
              { itemId: exact.id, expectedRevision: 0 },
            ],
          },
          scope.writerContext,
          fixture.db,
        );
        const matches = (
          await readBusinessMatchesFor(
            scope.project.publicId,
            a.publicId,
            observed.run.id,
            scope.writerContext,
            fixture.db,
          )
        ).decisions;
        expect(matches.find(({ itemId }) => itemId === observed.item.id)).toMatchObject({
          status: "rejected",
          reason: "stable_identifier_conflict",
        });
        expect(matches.find(({ itemId }) => itemId === exact.id)).toMatchObject({
          status: "confirmed",
          matchedBy: "stable_id",
          originalOrdinals: { slot: 3 },
        });
        expect(fetch).not.toHaveBeenCalled();
      } finally {
        fetch.mockRestore();
      }
    });
    it("denies another project's observation even to a valid own-project writer", async () => {
      const a = await location();
      const other = await seedBusinessProject(fixture);
      const observed = await seedRetainedObservation(fixture, other.project.id);
      await expect(
        rematchBusinessLocationFor(rematchInput(a, observed), scope.writerContext, fixture.db),
      ).rejects.toMatchObject({ status: 404 });
      expect(
        await fixture.db.businessMatchDecision.count({ where: { projectId: scope.project.id } }),
      ).toBe(0);
    });
    it("does not substitute executedAt or createdAt for missing original evidence", async () => {
      const a = await location();
      const observed = await seedRetainedObservation(fixture, scope.project.id, {
        observedAt: null,
      });
      await expect(
        rematchBusinessLocationFor(rematchInput(a, observed), scope.writerContext, fixture.db),
      ).rejects.toMatchObject({ status: 422, reason: "missing_observed_at" });
      expect(
        await fixture.db.businessMatchDecision.count({ where: { projectId: scope.project.id } }),
      ).toBe(0);
    });
    it("re-evaluates stored weak candidates against newly acquired conflicting strong IDs", async () => {
      const a = await location();
      const observed = await seedRetainedObservation(fixture, scope.project.id, {
        cid: "12345678901234567890",
      });
      await rematchBusinessLocationFor(rematchInput(a, observed), scope.writerContext, fixture.db);
      const candidate = await latest(a, observed.run.id);
      expect(candidate.status).toBe("candidate");
      await location("12345678901234567890");
      await expect(
        reviewBusinessCandidateFor(
          {
            projectId: scope.project.publicId,
            locationId: a.publicId,
            identityRevisionId: a.currentRevision.id,
            observationRunId: observed.run.id,
            itemId: observed.item.id,
            decisionId: candidate.id,
            expectedDecisionRevision: 1,
            idempotencyKey: randomUUID(),
            action: "confirm",
            reason: "Synthetic review",
          },
          scope.writerContext,
          fixture.db,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect((await latest(a, observed.run.id)).id).toBe(candidate.id);
    });
    it("appends manual and explicit rematch decisions while preserving original time and versions", async () => {
      const a = await location();
      const observed = await seedRetainedObservation(fixture, scope.project.id, {
        observedAt: "2026-10-01T12:00:00.000+02:00",
      });
      const command = rematchInput(a, observed);
      const first = await rematchBusinessLocationFor(command, scope.writerContext, fixture.db);
      expect(await rematchBusinessLocationFor(command, scope.writerContext, fixture.db)).toEqual({
        receipt: first.receipt,
        replayed: true,
      });
      const candidate = await latest(a, observed.run.id);
      await reviewBusinessCandidateFor(
        {
          projectId: scope.project.publicId,
          locationId: a.publicId,
          identityRevisionId: a.currentRevision.id,
          observationRunId: observed.run.id,
          itemId: observed.item.id,
          decisionId: candidate.id,
          expectedDecisionRevision: 1,
          idempotencyKey: randomUUID(),
          action: "confirm",
          reason: "Synthetic exact-item review",
        },
        scope.writerContext,
        fixture.db,
      );
      await rematchBusinessLocationFor(
        rematchInput(a, observed, 2),
        scope.writerContext,
        fixture.db,
      );
      const history = (
        await readBusinessMatchesFor(
          scope.project.publicId,
          a.publicId,
          observed.run.id,
          scope.writerContext,
          fixture.db,
        )
      ).decisions;
      expect(history.map(({ status }) => status)).toEqual(["candidate", "confirmed", "candidate"]);
      expect(
        history.every(({ observedAt }) => observedAt === "2026-10-01T12:00:00.000+02:00"),
      ).toBe(true);
      const stored = await fixture.db.businessMatchDecision.findFirstOrThrow({
        where: { id: history[1].id },
      });
      expect(stored.evidence).toMatchObject({
        source: {
          provider: "synthetic",
          adapterVersion: "synthetic-observation-v1",
          normalizationVersion: "synthetic-normalizer-v1",
          sourceOrdinal: 0,
          sourceBlockId: "synthetic-block",
          rankScale: "pack_slot",
        },
      });
      expect(history[1].confirmedBy).toBe(scope.writer.id);
      expect(history[2].previousDecisionId).toBe(history[1].id);
    });
    it("binds review to unchanged normalized item data without consulting raw fragments", async () => {
      const a = await location();
      const observed = await seedRetainedObservation(fixture, scope.project.id);
      await rematchBusinessLocationFor(rematchInput(a, observed), scope.writerContext, fixture.db);
      const candidate = await latest(a, observed.run.id);
      await fixture.db.observationItem.update({
        where: { id: observed.item.id },
        data: { businessName: "Changed retained item" },
      });
      await expect(
        reviewBusinessCandidateFor(
          {
            projectId: scope.project.publicId,
            locationId: a.publicId,
            identityRevisionId: a.currentRevision.id,
            observationRunId: observed.run.id,
            itemId: observed.item.id,
            decisionId: candidate.id,
            expectedDecisionRevision: 1,
            idempotencyKey: randomUUID(),
            action: "confirm",
            reason: "Synthetic review",
          },
          scope.writerContext,
          fixture.db,
        ),
      ).rejects.toMatchObject({ status: 409 });
    });
  },
);
