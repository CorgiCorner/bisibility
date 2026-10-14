import { randomUUID } from "node:crypto";
import { makePublicId } from "@/lib/db/public-id-resources";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readBusinessIdentityHistory } from "./identity-history";
import { readBusinessLocationFor } from "./location-read";
import { createBusinessLocationFor, reviseBusinessLocationFor } from "./location-write";
import { rematchBusinessLocationFor } from "./match-write";
import {
  type BusinessPgFixture,
  businessLocationDatabase,
  identityCommand,
  seedBusinessProject,
  seedRetainedObservation,
} from "./postgres.test-fixture";
import { readBusinessObservationChoices, readBusinessReviewContext } from "./review-context";
import { readBusinessScopeChoices } from "./scope-choices";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/audit", async (original) => ({
  ...(await original<typeof import("@/lib/auth/audit")>()),
  writeAuditFailure: vi.fn(async () => undefined),
}));

describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)(
  "business settings authorized UI read workflow",
  () => {
    let fixture: BusinessPgFixture;
    beforeEach(async () => {
      fixture = await businessLocationDatabase();
    }, 120000);
    afterEach(async () => {
      await fixture?.close();
      vi.unstubAllGlobals();
    });

    it("pages the complete active search scope without exposing another project or assigning a subject", async () => {
      const project = await seedBusinessProject(fixture);
      const observed = await seedRetainedObservation(fixture, project.project.id);
      const foreign = await seedBusinessProject(fixture);
      const ids = Array.from({ length: 53 }, () => makePublicId("kw"));
      await fixture.db.keyword.createMany({
        data: ids.map((publicId, i) => ({
          publicId,
          projectId: project.project.id,
          text: `scope-${i}`,
          location: "Synthetic",
          locationId: observed.keyword.locationId,
        })),
      });
      await fixture.db.keyword.createMany({
        data: [
          {
            publicId: makePublicId("kw"),
            projectId: foreign.project.id,
            text: "scope-foreign",
            location: "Synthetic",
            locationId: observed.keyword.locationId,
          },
          {
            publicId: makePublicId("kw"),
            projectId: project.project.id,
            text: "scope-archived",
            location: "Synthetic",
            locationId: observed.keyword.locationId,
            archivedAt: new Date(),
          },
        ],
      });
      const first = await readBusinessScopeChoices(
        project.project.publicId,
        { kind: "keyword", search: "scope-", after: null },
        project.ownerContext,
        fixture.db,
      );
      expect(first.choices).toHaveLength(50);
      expect(first.next).not.toBeNull();
      const second = await readBusinessScopeChoices(
        project.project.publicId,
        { kind: "keyword", search: "scope-", after: first.next },
        project.ownerContext,
        fixture.db,
      );
      expect(second.choices).toHaveLength(3);
      expect(second.next).toBeNull();
      expect([...first.choices, ...second.choices].map((row) => row.scope.id).sort()).toEqual(
        ids.sort(),
      );
      expect(await fixture.db.businessAssignmentHead.count()).toBe(0);
    });

    it("retains original matching dates and versions while missing evidence remains unavailable, with zero HTTP", async () => {
      const http = vi.fn(() => {
        throw new Error("Read/rematch must not call a provider");
      });
      vi.stubGlobal("fetch", http);
      const project = await seedBusinessProject(fixture);
      const foreign = await seedBusinessProject(fixture);
      const source = await seedRetainedObservation(fixture, project.project.id);
      const missing = await seedRetainedObservation(fixture, project.project.id, {
        observedAt: null,
      });
      const foreignSource = await seedRetainedObservation(fixture, foreign.project.id);
      const saved = await createBusinessLocationFor(
        identityCommand(project.project.publicId),
        project.writerContext,
        fixture.db,
      );
      if (saved.receipt.kind !== "identity") throw new Error("Expected location");
      const location = (
        await readBusinessLocationFor(
          project.project.publicId,
          saved.receipt.publicId,
          project.writerContext,
          fixture.db,
        )
      ).location;
      const before = await readBusinessReviewContext(
        project.project.publicId,
        location.publicId,
        source.run.id,
        project.ownerContext,
        fixture.db,
      );
      expect(before).toMatchObject({
        evidenceAvailable: true,
        expectedDecisions: [{ itemId: source.item.id, expectedRevision: 0 }],
      });
      await rematchBusinessLocationFor(
        {
          projectId: project.project.publicId,
          locationId: location.publicId,
          identityRevisionId: location.currentRevision.id,
          observationRunId: source.run.id,
          expectedDecisions: before.expectedDecisions,
          idempotencyKey: randomUUID(),
        },
        project.writerContext,
        fixture.db,
      );
      const after = await readBusinessReviewContext(
        project.project.publicId,
        location.publicId,
        source.run.id,
        project.ownerContext,
        fixture.db,
      );
      expect(after.decisions[0]).toMatchObject({
        observedAt: "2026-10-01T10:00:00.000Z",
        decisionRevision: 1,
        status: "candidate",
      });
      expect(after.expectedDecisions[0].expectedRevision).toBe(1);
      expect(
        await readBusinessReviewContext(
          project.project.publicId,
          location.publicId,
          missing.run.id,
          project.ownerContext,
          fixture.db,
        ),
      ).toMatchObject({ evidenceAvailable: false });
      const choices = await readBusinessObservationChoices(
        project.project.publicId,
        null,
        project.ownerContext,
        fixture.db,
      );
      expect(choices.choices.map((row) => row.id)).not.toContain(foreignSource.run.id);
      await expect(
        readBusinessReviewContext(
          project.project.publicId,
          location.publicId,
          foreignSource.run.id,
          project.ownerContext,
          fixture.db,
        ),
      ).rejects.toMatchObject({ status: 404 });
      expect(http).not.toHaveBeenCalled();
      expect(
        await fixture.db.keywordSchedule.count({
          where: { keyword: { projectId: project.project.id } },
        }),
      ).toBe(0);
    });

    it("rechecks actual membership and account state instead of trusting cached UI permissions", async () => {
      const project = await seedBusinessProject(fixture);
      await fixture.db.membership.delete({
        where: { userId_projectId: { userId: project.owner.id, projectId: project.project.id } },
      });
      await expect(
        readBusinessScopeChoices(
          project.project.publicId,
          { kind: "keyword", search: "", after: null },
          project.ownerContext,
          fixture.db,
        ),
      ).rejects.toMatchObject({ code: "forbidden" });
      await fixture.db.user.update({
        where: { id: project.writer.id },
        data: { deactivatedAt: new Date() },
      });
      await expect(
        readBusinessObservationChoices(
          project.project.publicId,
          null,
          project.writerContext,
          fixture.db,
        ),
      ).rejects.toMatchObject({ code: "forbidden" });
    });
    it("pages immutable identity history and preserves the original identity instead of copying the latest name", async () => {
      const project = await seedBusinessProject(fixture);
      const input = identityCommand(project.project.publicId);
      const saved = await createBusinessLocationFor(input, project.writerContext, fixture.db);
      if (saved.receipt.kind !== "identity") throw new Error("Expected location");
      for (let revision = 1; revision < 53; revision += 1)
        await reviseBusinessLocationFor(
          {
            projectId: project.project.publicId,
            locationId: saved.receipt.publicId,
            expectedRevision: revision,
            patch: { name: `Revision ${revision + 1}` },
            reason: "Synthetic reviewed update",
            idempotencyKey: randomUUID(),
          },
          project.writerContext,
          fixture.db,
        );
      const first = await readBusinessIdentityHistory(
        project.project.publicId,
        saved.receipt.publicId,
        0,
        project.ownerContext,
        fixture.db,
      );
      expect(first.rows).toHaveLength(50);
      expect(first.next).toBe(50);
      expect(first.rows[0].identity.name).toBe(input.identity.name);
      const second = await readBusinessIdentityHistory(
        project.project.publicId,
        saved.receipt.publicId,
        first.next,
        project.ownerContext,
        fixture.db,
      );
      expect(second.rows).toHaveLength(3);
      expect(second.next).toBeNull();
      expect(second.rows[2].identity).toMatchObject({ revision: 53, name: "Revision 53" });
      const foreign = await seedBusinessProject(fixture);
      await expect(
        readBusinessIdentityHistory(
          foreign.project.publicId,
          saved.receipt.publicId,
          0,
          foreign.ownerContext,
          fixture.db,
        ),
      ).rejects.toMatchObject({ status: 404 });
    });
  },
);
