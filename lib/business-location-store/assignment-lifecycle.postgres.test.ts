import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readBusinessAssignmentFor } from "./assignment-read";
import { assignBusinessLocationFor } from "./assignment-write";
import { readBusinessLocationFor } from "./location-read";
import {
  createBusinessLocationFor,
  reviseBusinessLocationFor,
  setBusinessLocationStateFor,
} from "./location-write";
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
  "business assignment and real lifecycle constraints",
  () => {
    let fixture: BusinessPgFixture;
    let project: Awaited<ReturnType<typeof seedBusinessProject>>;
    beforeAll(async () => {
      fixture = await businessLocationDatabase();
    }, 120000);
    afterAll(async () => {
      await fixture?.close();
    });
    beforeEach(async () => {
      project = await seedBusinessProject(fixture);
    });
    async function setup() {
      const saved = await createBusinessLocationFor(
        identityCommand(project.project.publicId),
        project.writerContext,
        fixture.db,
      );
      if (saved.receipt.kind !== "identity") throw new Error("Expected identity");
      const location = (
        await readBusinessLocationFor(
          project.project.publicId,
          saved.receipt.publicId,
          project.writerContext,
          fixture.db,
        )
      ).location;
      const observed = await seedRetainedObservation(fixture, project.project.id);
      return {
        location,
        observed,
        scope: { kind: "keyword" as const, id: observed.keyword.publicId },
      };
    }
    it("preserves assignment revisions and marks changed identity or archive unavailable without rewriting history", async () => {
      const { location, observed, scope } = await setup();
      const command = {
        projectId: project.project.publicId,
        scope,
        expectedRevision: 0,
        target: { locationId: location.publicId, identityRevisionId: location.currentRevision.id },
        reason: "Synthetic assignment",
        idempotencyKey: randomUUID(),
      };
      await assignBusinessLocationFor(command, project.writerContext, fixture.db);
      await expect(
        assignBusinessLocationFor(
          { ...command, idempotencyKey: randomUUID() },
          project.writerContext,
          fixture.db,
        ),
      ).rejects.toMatchObject({ status: 409 });
      await reviseBusinessLocationFor(
        {
          projectId: project.project.publicId,
          locationId: location.publicId,
          expectedRevision: 1,
          patch: { name: "New identity" },
          reason: "Synthetic identity boundary",
          idempotencyKey: randomUUID(),
        },
        project.writerContext,
        fixture.db,
      );
      const old = await readBusinessAssignmentFor(
        project.project.publicId,
        scope,
        project.ownerContext,
        fixture.db,
      );
      expect(old).toMatchObject({
        targetAvailable: false,
        current: { identityRevisionId: location.currentRevision.id },
      });
      const revised = (
        await readBusinessLocationFor(
          project.project.publicId,
          location.publicId,
          project.writerContext,
          fixture.db,
        )
      ).location;
      await assignBusinessLocationFor(
        {
          ...command,
          expectedRevision: 1,
          target: { locationId: location.publicId, identityRevisionId: revised.currentRevision.id },
          idempotencyKey: randomUUID(),
        },
        project.writerContext,
        fixture.db,
      );
      expect(
        (
          await readBusinessAssignmentFor(
            project.project.publicId,
            scope,
            project.ownerContext,
            fixture.db,
          )
        ).history,
      ).toHaveLength(2);
      await setBusinessLocationStateFor(
        {
          projectId: project.project.publicId,
          locationId: location.publicId,
          expectedVersion: revised.version,
          state: "archived",
          idempotencyKey: randomUUID(),
        },
        project.writerContext,
        fixture.db,
      );
      expect(
        (
          await readBusinessAssignmentFor(
            project.project.publicId,
            scope,
            project.ownerContext,
            fixture.db,
          )
        ).targetAvailable,
      ).toBe(false);
      expect(await fixture.db.rankCheck.count({ where: { keywordId: observed.keyword.id } })).toBe(
        1,
      );
      expect(
        await fixture.db.checkSchedule.count({ where: { projectId: project.project.id } }),
      ).toBe(0);
    });
    it("refuses another project's keyword scope and retains explicit unassignment history", async () => {
      const { location, scope } = await setup();
      const other = await seedBusinessProject(fixture);
      const foreign = await seedRetainedObservation(fixture, other.project.id);
      const command = {
        projectId: project.project.publicId,
        scope,
        expectedRevision: 0,
        target: { locationId: location.publicId, identityRevisionId: location.currentRevision.id },
        reason: "Synthetic assignment",
        idempotencyKey: randomUUID(),
      };
      await expect(
        assignBusinessLocationFor(
          { ...command, scope: { kind: "keyword", id: foreign.keyword.publicId } },
          project.writerContext,
          fixture.db,
        ),
      ).rejects.toMatchObject({ status: 404 });
      await assignBusinessLocationFor(command, project.writerContext, fixture.db);
      await assignBusinessLocationFor(
        { ...command, expectedRevision: 1, target: null, idempotencyKey: randomUUID() },
        project.writerContext,
        fixture.db,
      );
      expect(
        await readBusinessAssignmentFor(
          project.project.publicId,
          scope,
          project.ownerContext,
          fixture.db,
        ),
      ).toMatchObject({
        targetAvailable: false,
        current: { entityId: null, identityRevisionId: null },
        history: [{ revision: 1 }, { revision: 2 }],
      });
    });
    it("rejects direct history or attribution edits but permits real account-delete SetNull without fabricating authors", async () => {
      const { location, observed } = await setup();
      await rematchBusinessLocationFor(
        {
          projectId: project.project.publicId,
          locationId: location.publicId,
          identityRevisionId: location.currentRevision.id,
          observationRunId: observed.run.id,
          expectedDecisions: [{ itemId: observed.item.id, expectedRevision: 0 }],
          idempotencyKey: randomUUID(),
        },
        project.writerContext,
        fixture.db,
      );
      const candidate = (
        await readBusinessMatchesFor(
          project.project.publicId,
          location.publicId,
          observed.run.id,
          project.writerContext,
          fixture.db,
        )
      ).decisions[0];
      await reviewBusinessCandidateFor(
        {
          projectId: project.project.publicId,
          locationId: location.publicId,
          identityRevisionId: location.currentRevision.id,
          observationRunId: observed.run.id,
          itemId: observed.item.id,
          decisionId: candidate.id,
          expectedDecisionRevision: 1,
          action: "confirm",
          reason: "Synthetic review",
          idempotencyKey: randomUUID(),
        },
        project.writerContext,
        fixture.db,
      );
      const confirmed = (
        await readBusinessMatchesFor(
          project.project.publicId,
          location.publicId,
          observed.run.id,
          project.writerContext,
          fixture.db,
        )
      ).decisions[1];
      await expect(
        fixture.db.businessIdentityRevision.update({
          where: { id: location.currentRevision.id },
          data: { reason: "Overwrite" },
        }),
      ).rejects.toThrow();
      await expect(
        fixture.db.businessIdentityRevision.update({
          where: { id: location.currentRevision.id },
          data: { actorId: null },
        }),
      ).rejects.toThrow();
      await expect(
        fixture.db.businessMatchDecision.update({
          where: { id: confirmed.id },
          data: { confirmedBy: null },
        }),
      ).rejects.toThrow();
      await fixture.db.user.delete({ where: { id: project.writer.id } });
      expect(
        (
          await readBusinessLocationFor(
            project.project.publicId,
            location.publicId,
            project.ownerContext,
            fixture.db,
          )
        ).location.currentRevision.actorId,
      ).toBeNull();
      expect(
        (
          await readBusinessMatchesFor(
            project.project.publicId,
            location.publicId,
            observed.run.id,
            project.ownerContext,
            fixture.db,
          )
        ).decisions[1],
      ).toMatchObject({ status: "confirmed", confirmedBy: null, observedAt: confirmed.observedAt });
    });
    it("enforces same-project run/item FKs independently of the service", async () => {
      const { location } = await setup();
      const other = await seedBusinessProject(fixture);
      const foreign = await seedRetainedObservation(fixture, other.project.id);
      await expect(
        fixture.db.businessMatchHead.create({
          data: {
            projectId: project.project.id,
            entityId: location.id,
            observationRunId: foreign.run.id,
            itemId: foreign.item.id,
          },
        }),
      ).rejects.toThrow();
    });
    it("cascades the complete project graph including assignment, matching and replay records", async () => {
      const { location, observed, scope } = await setup();
      await assignBusinessLocationFor(
        {
          projectId: project.project.publicId,
          scope,
          expectedRevision: 0,
          target: {
            locationId: location.publicId,
            identityRevisionId: location.currentRevision.id,
          },
          reason: "Synthetic assignment",
          idempotencyKey: randomUUID(),
        },
        project.writerContext,
        fixture.db,
      );
      await rematchBusinessLocationFor(
        {
          projectId: project.project.publicId,
          locationId: location.publicId,
          identityRevisionId: location.currentRevision.id,
          observationRunId: observed.run.id,
          expectedDecisions: [{ itemId: observed.item.id, expectedRevision: 0 }],
          idempotencyKey: randomUUID(),
        },
        project.writerContext,
        fixture.db,
      );
      await fixture.db.project.delete({ where: { id: project.project.id } });
      const where = { projectId: project.project.id };
      for (const count of [
        await fixture.db.businessLocation.count({ where }),
        await fixture.db.businessIdentityRevision.count({ where }),
        await fixture.db.businessIdentifierClaim.count({ where }),
        await fixture.db.businessMatchHead.count({ where }),
        await fixture.db.businessMatchDecision.count({ where }),
        await fixture.db.businessAssignmentHead.count({ where }),
        await fixture.db.businessAssignmentRevision.count({ where }),
        await fixture.db.businessLocationMutation.count({ where }),
      ])
        expect(count).toBe(0);
    });
  },
);
