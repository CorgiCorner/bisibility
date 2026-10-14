import { randomUUID } from "node:crypto";
import { databaseConnectionConfig } from "@/lib/db/pool-config";
import { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readBusinessLocationFor } from "./location-read";
import { createBusinessLocationFor, reviseBusinessLocationFor } from "./location-write";
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
  "item-scoped current confirmation authority",
  () => {
    let fixture: BusinessPgFixture;
    let repeatableDefault: PrismaClient;
    let scope: Awaited<ReturnType<typeof seedBusinessProject>>;
    beforeAll(async () => {
      fixture = await businessLocationDatabase();
      const own = await fixture.client.query<{ name: string }>("SELECT current_database() AS name");
      const url = new URL(process.env.PROVIDER_UI_TEST_DATABASE_URL!);
      url.pathname = `/${own.rows[0].name}`;
      repeatableDefault = new PrismaClient({
        adapter: new PrismaPg({
          connectionString: url.href,
          ...databaseConnectionConfig(url.href),
        }),
        transactionOptions: { isolationLevel: "RepeatableRead" },
      });
    }, 120000);
    afterAll(async () => {
      await repeatableDefault?.$disconnect();
      await fixture?.close();
    });
    beforeEach(async () => {
      scope = await seedBusinessProject(fixture);
    });
    async function location() {
      const result = await createBusinessLocationFor(
        identityCommand(scope.project.publicId),
        scope.writerContext,
        fixture.db,
      );
      if (result.receipt.kind !== "identity") throw new Error("identity required");
      return (
        await readBusinessLocationFor(
          scope.project.publicId,
          result.receipt.publicId,
          scope.writerContext,
          fixture.db,
        )
      ).location;
    }
    async function candidate(
      entity: Awaited<ReturnType<typeof location>>,
      observed: Awaited<ReturnType<typeof seedRetainedObservation>>,
    ) {
      await rematchBusinessLocationFor(
        {
          projectId: scope.project.publicId,
          locationId: entity.publicId,
          identityRevisionId: entity.currentRevision.id,
          observationRunId: observed.run.id,
          expectedDecisions: [{ itemId: observed.item.id, expectedRevision: 0 }],
          idempotencyKey: randomUUID(),
        },
        scope.writerContext,
        fixture.db,
      );
      return (
        await readBusinessMatchesFor(
          scope.project.publicId,
          entity.publicId,
          observed.run.id,
          scope.writerContext,
          fixture.db,
        )
      ).decisions.at(-1)!;
    }
    function review(
      entity: Awaited<ReturnType<typeof location>>,
      decision: Awaited<ReturnType<typeof candidate>>,
      action = "confirm",
    ) {
      return {
        projectId: scope.project.publicId,
        locationId: entity.publicId,
        identityRevisionId: entity.currentRevision.id,
        observationRunId: decision.observationRunId,
        itemId: decision.itemId,
        decisionId: decision.id,
        expectedDecisionRevision: decision.decisionRevision,
        idempotencyKey: randomUUID(),
        action,
        reason: "Synthetic exact-item review",
      };
    }
    it("serializes competing confirmations, atomically refuses the loser, then allows release and exact replay", async () => {
      const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No provider IO"));
      try {
        const a = await location(),
          b = await location();
        const observed = await seedRetainedObservation(fixture, scope.project.id);
        const ca = await candidate(a, observed),
          cb = await candidate(b, observed);
        const inputs = [review(a, ca), review(b, cb)];
        const outcomes = await Promise.allSettled(
          inputs.map((input) =>
            reviewBusinessCandidateFor(input, scope.writerContext, repeatableDefault),
          ),
        );
        expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        const loser = outcomes.findIndex((result) => result.status === "rejected"),
          winner = 1 - loser;
        expect(outcomes[loser]).toMatchObject({ status: "rejected", reason: { status: 409 } });
        expect(
          await fixture.db.businessMatchDecision.count({ where: { projectId: scope.project.id } }),
        ).toBe(3);
        const loserHead = await fixture.db.businessMatchHead.findFirstOrThrow({
          where: { entityId: [a, b][loser].currentRevision.entityId, itemId: observed.item.id },
        });
        expect(loserHead.version).toBe(1);
        expect(loserHead.currentDecisionId).toBe([ca, cb][loser].id);
        expect(
          await fixture.db.businessLocationMutation.count({
            where: { projectId: scope.project.id, operation: "review_match" },
          }),
        ).toBe(1);
        const confirmed = (
          await readBusinessMatchesFor(
            scope.project.publicId,
            [a, b][winner].publicId,
            observed.run.id,
            scope.writerContext,
            fixture.db,
          )
        ).decisions.at(-1)!;
        await reviewBusinessCandidateFor(
          review([a, b][winner], confirmed, "reject"),
          scope.writerContext,
          fixture.db,
        );
        await reviewBusinessCandidateFor(inputs[loser], scope.writerContext, fixture.db);
        const count = await fixture.db.businessMatchDecision.count({
          where: { projectId: scope.project.id },
        });
        expect(
          await reviewBusinessCandidateFor(inputs[winner], scope.writerContext, fixture.db),
        ).toMatchObject({ replayed: true });
        expect(
          await fixture.db.businessMatchDecision.count({ where: { projectId: scope.project.id } }),
        ).toBe(count);
        await expect(
          reviewBusinessCandidateFor(
            { ...inputs[winner], reason: "Changed replay body" },
            scope.writerContext,
            fixture.db,
          ),
        ).rejects.toMatchObject({ status: 409, reason: "idempotency_conflict" });
        await fixture.db.membership.updateMany({
          where: { projectId: scope.project.id, userId: scope.writer.id },
          data: { role: "viewer" },
        });
        await expect(
          reviewBusinessCandidateFor(inputs[winner], scope.writerContext, fixture.db),
        ).rejects.toMatchObject({ code: "forbidden" });
        expect(fetch).not.toHaveBeenCalled();
      } finally {
        fetch.mockRestore();
      }
    });
    it("prevents confirmed rematch from bypassing another entity current manual claim", async () => {
      const a = await location(),
        b = await location();
      const observed = await seedRetainedObservation(fixture, scope.project.id, { cid: "123" });
      const cb = await candidate(b, observed);
      await reviewBusinessCandidateFor(review(b, cb), scope.writerContext, fixture.db);
      const revised = await reviseBusinessLocationFor(
        {
          projectId: scope.project.publicId,
          locationId: a.publicId,
          expectedRevision: 1,
          patch: {
            identifiers: [
              { namespace: "google_business", engine: "google", type: "cid", value: "123" },
            ],
          },
          reason: "Synthetic acquired ID",
          idempotencyKey: randomUUID(),
        },
        scope.writerContext,
        fixture.db,
      );
      if (revised.receipt.kind !== "identity") throw new Error("identity required");
      await expect(
        rematchBusinessLocationFor(
          {
            projectId: scope.project.publicId,
            locationId: a.publicId,
            identityRevisionId: revised.receipt.revisionId,
            observationRunId: observed.run.id,
            expectedDecisions: [{ itemId: observed.item.id, expectedRevision: 0 }],
            idempotencyKey: randomUUID(),
          },
          scope.writerContext,
          fixture.db,
        ),
      ).rejects.toMatchObject({ status: 409, reason: "state_conflict" });
      expect(
        await fixture.db.businessMatchHead.count({
          where: { projectId: scope.project.id, entityId: a.currentRevision.entityId },
        }),
      ).toBe(0);
    });
    it("does not let an own-project writer claim another project item", async () => {
      const a = await location();
      const other = await seedBusinessProject(fixture);
      const observed = await seedRetainedObservation(fixture, other.project.id);
      await expect(candidate(a, observed)).rejects.toMatchObject({ status: 404 });
      expect(
        await fixture.db.businessMatchHead.count({ where: { projectId: scope.project.id } }),
      ).toBe(0);
    });
    it("allows two entities to confirm different items in one run", async () => {
      const a = await location(),
        b = await location();
      const observed = await seedRetainedObservation(fixture, scope.project.id);
      const second = await fixture.db.observationItem.create({
        data: {
          observationRunId: observed.run.id,
          ordinal: 1,
          resultKind: "local_pack",
          rawFragment: Prisma.JsonNull,
          businessName: "Żółta firma",
          domain: "example.test",
          observedAt: new Date("2026-10-01T10:00:00.000Z"),
        },
      });
      const ca = await candidate(a, observed),
        cb = await candidate(b, { ...observed, item: second });
      await reviewBusinessCandidateFor(review(a, ca), scope.writerContext, fixture.db);
      await reviewBusinessCandidateFor(review(b, cb), scope.writerContext, fixture.db);
      expect(
        await fixture.db.businessMatchDecision.count({
          where: { projectId: scope.project.id, status: "confirmed" },
        }),
      ).toBe(2);
    });
  },
);
