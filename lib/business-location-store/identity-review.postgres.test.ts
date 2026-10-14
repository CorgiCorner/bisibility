import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { businessCommandResult } from "./command-result";
import { readBusinessLocationFor } from "./location-read";
import {
  createBusinessLocationFor,
  reviseBusinessLocationFor,
  setBusinessLocationStateFor,
} from "./location-write";
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
  "identity writer and complete retained review",
  () => {
    let fixture: BusinessPgFixture;
    beforeAll(async () => {
      fixture = await businessLocationDatabase();
    }, 120000);
    afterAll(async () => {
      await fixture?.close();
      vi.unstubAllGlobals();
    });
    it("derives URL-only claims in the real writer, rejects conflicting revision atomically, without mutating the original revision", async () => {
      const scope = await seedBusinessProject(fixture);
      const input = identityCommand(scope.project.publicId);
      const command = {
        ...input,
        identity: {
          ...input.identity,
          mapsUrl: "https://www.google.com/maps?cid=18446744073709551615&query_place_id=ChIJExact",
        },
      };
      const created = await createBusinessLocationFor(command, scope.writerContext, fixture.db);
      if (created.receipt.kind !== "identity") throw new Error("Expected identity");
      const stored = (
        await readBusinessLocationFor(
          scope.project.publicId,
          created.receipt.publicId,
          scope.writerContext,
          fixture.db,
        )
      ).location;
      expect(stored.currentRevision.normalizerVersion).toBe("business-identity-v2");
      expect(
        stored.currentRevision.snapshot.identifiers.map((row) => [
          row.type,
          row.value,
          row.provenance.source,
        ]),
      ).toEqual([
        ["cid", "18446744073709551615", "maps_url"],
        ["place_id", "ChIJExact", "maps_url"],
      ]);
      expect(
        await fixture.db.businessIdentifierClaim.count({ where: { projectId: scope.project.id } }),
      ).toBe(2);
      const revisions = await fixture.db.businessIdentityRevision.count({
        where: { projectId: scope.project.id },
      });
      await expect(
        reviseBusinessLocationFor(
          {
            projectId: scope.project.publicId,
            locationId: stored.publicId,
            expectedRevision: 1,
            patch: { mapsUrl: "https://www.google.com/maps?cid=1234" },
            reason: "Conflicting retained CID",
            idempotencyKey: randomUUID(),
          },
          scope.writerContext,
          fixture.db,
        ),
      ).rejects.toMatchObject({ reason: "maps_identifier_conflict" });
      expect(
        await fixture.db.businessIdentityRevision.count({ where: { projectId: scope.project.id } }),
      ).toBe(revisions);
      expect(
        await fixture.db.businessLocationMutation.count({ where: { projectId: scope.project.id } }),
      ).toBe(1);
      expect(await createBusinessLocationFor(command, scope.writerContext, fixture.db)).toEqual({
        receipt: created.receipt,
        replayed: true,
      });
      const foreign = await seedBusinessProject(fixture);
      await expect(
        createBusinessLocationFor(
          { ...command, projectId: foreign.project.publicId, idempotencyKey: randomUUID() },
          foreign.writerContext,
          fixture.db,
        ),
      ).resolves.toMatchObject({ replayed: false });
    });
    it("restore collision has a named outcome and never authorizes same-version recovery; claim/state remain unchanged", async () => {
      const scope = await seedBusinessProject(fixture);
      const first = await createBusinessLocationFor(
        identityCommand(scope.project.publicId, "1234567890"),
        scope.writerContext,
        fixture.db,
      );
      if (first.receipt.kind !== "identity") throw new Error("Expected identity");
      await setBusinessLocationStateFor(
        {
          projectId: scope.project.publicId,
          locationId: first.receipt.publicId,
          expectedVersion: 1,
          state: "archived",
          idempotencyKey: randomUUID(),
        },
        scope.writerContext,
        fixture.db,
      );
      await createBusinessLocationFor(
        identityCommand(scope.project.publicId, "1234567890"),
        scope.writerContext,
        fixture.db,
      );
      const locationId = first.receipt.publicId;
      const current = vi.fn(async () => {
        throw new Error("Current identity must not be read on a claim collision");
      });
      const result = await businessCommandResult(
        () =>
          setBusinessLocationStateFor(
            {
              projectId: scope.project.publicId,
              locationId,
              expectedVersion: 2,
              state: "active",
              idempotencyKey: randomUUID(),
            },
            scope.writerContext,
            fixture.db,
          ),
        current,
      );
      expect(result).toEqual({ kind: "identifier_claimed" });
      expect(current).not.toHaveBeenCalled();
      const archived = await readBusinessLocationFor(
        scope.project.publicId,
        first.receipt.publicId,
        scope.writerContext,
        fixture.db,
      );
      expect(archived.location).toMatchObject({ state: "archived", version: 2 });
      expect(
        await fixture.db.businessIdentifierClaim.count({ where: { projectId: scope.project.id } }),
      ).toBe(1);
    });
    it("reads all 257 retained candidates after restart with frozen watermark, fresh authorization, source binding and zero HTTP", async () => {
      const fetch = vi.fn(() => {
        throw new Error("No paid or network IO");
      });
      vi.stubGlobal("fetch", fetch);
      const scope = await seedBusinessProject(fixture);
      const source = await seedRetainedObservation(fixture, scope.project.id);
      const created = await createBusinessLocationFor(
        identityCommand(scope.project.publicId),
        scope.writerContext,
        fixture.db,
      );
      if (created.receipt.kind !== "identity") throw new Error("Expected identity");
      await fixture.db.observationItem.createMany({
        data: Array.from({ length: 256 }, (_, i) => ({
          observationRunId: source.run.id,
          resultKind: "local_pack",
          ordinal: i + 1,
          promotion: "unknown",
          observedAt: source.item.observedAt,
          businessName: "Synthetic",
          rawFragment: {},
        })),
      });
      const first = await readBusinessReviewContext(
        scope.project.publicId,
        created.receipt.publicId,
        source.run.id,
        scope.writerContext,
        fixture.db,
      );
      expect(first.includedCount).toBe(256);
      expect(first.eligibleTotal).toBe(257);
      const second = await readBusinessReviewContext(
        scope.project.publicId,
        created.receipt.publicId,
        source.run.id,
        scope.writerContext,
        fixture.db,
        { cursor: first.nextCursor },
      );
      expect(second.includedCount).toBe(1);
      expect(second.offset).toBe(256);
      expect(second.watermark).toBe(first.watermark);
      expect(second.nextCursor).toBeNull();
      expect(
        new Set([...first.expectedDecisions, ...second.expectedDecisions].map((row) => row.itemId))
          .size,
      ).toBe(257);
      const back = await readBusinessReviewContext(
        scope.project.publicId,
        created.receipt.publicId,
        source.run.id,
        scope.writerContext,
        fixture.db,
        { cursor: second.previousCursor },
      );
      expect(back.expectedDecisions).toEqual(first.expectedDecisions);
      const foreign = await seedBusinessProject(fixture);
      await expect(
        readBusinessReviewContext(
          foreign.project.publicId,
          created.receipt.publicId,
          source.run.id,
          foreign.writerContext,
          fixture.db,
          { cursor: first.nextCursor },
        ),
      ).rejects.toMatchObject({ status: 404 });
      await fixture.db.observationItem.update({
        where: { id: source.item.id },
        data: { businessName: "Changed source" },
      });
      await expect(
        readBusinessReviewContext(
          scope.project.publicId,
          created.receipt.publicId,
          source.run.id,
          scope.writerContext,
          fixture.db,
          { cursor: first.nextCursor },
        ),
      ).rejects.toMatchObject({ reason: "review_cursor_conflict" });
      await fixture.db.membership.delete({
        where: { userId_projectId: { userId: scope.writer.id, projectId: scope.project.id } },
      });
      await expect(
        readBusinessReviewContext(
          scope.project.publicId,
          created.receipt.publicId,
          source.run.id,
          scope.writerContext,
          fixture.db,
        ),
      ).rejects.toMatchObject({ code: "forbidden" });
      expect(
        (await fixture.db.observationItem.findUniqueOrThrow({ where: { id: source.item.id } }))
          .observedAt,
      ).toEqual(source.item.observedAt);
      expect(fetch).not.toHaveBeenCalled();
    });
  },
);
