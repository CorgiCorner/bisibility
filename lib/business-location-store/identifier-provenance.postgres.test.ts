import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readBusinessLocationFor } from "./location-read";
import { createBusinessLocationFor, reviseBusinessLocationFor } from "./location-write";
import {
  type BusinessPgFixture,
  businessLocationDatabase,
  identityCommand,
  seedBusinessProject,
} from "./postgres.test-fixture";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/audit", async (original) => ({
  ...(await original<typeof import("@/lib/auth/audit")>()),
  writeAuditFailure: vi.fn(async () => undefined),
}));

describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)(
  "adjacent identifier provenance transactions",
  () => {
    let fixture: BusinessPgFixture;
    const fetch = vi.fn(() => {
      throw new Error("No provider or network IO");
    });
    beforeAll(async () => {
      vi.stubGlobal("fetch", fetch);
      fixture = await businessLocationDatabase();
    }, 120000);
    afterAll(async () => {
      await fixture?.close();
      vi.unstubAllGlobals();
    });

    async function retainedIdentity() {
      const scope = await seedBusinessProject(fixture);
      const input = identityCommand(scope.project.publicId);
      const result = await createBusinessLocationFor(
        {
          ...input,
          identity: {
            ...input.identity,
            mapsUrl:
              "https://www.google.com/maps?cid=18446744073709551615&query_place_id=ChIJExact",
          },
        },
        scope.writerContext,
        fixture.db,
      );
      if (result.receipt.kind !== "identity") throw new Error("Expected identity receipt");
      const location = (
        await readBusinessLocationFor(
          scope.project.publicId,
          result.receipt.publicId,
          scope.writerContext,
          fixture.db,
        )
      ).location;
      return { scope, location };
    }

    it("revises a CID through the real writer without relabeling the unchanged Maps-derived Place ID or old revision", async () => {
      const { scope, location } = await retainedIdentity();
      const original = location.currentRevision;
      const command = {
        projectId: scope.project.publicId,
        locationId: location.publicId,
        expectedRevision: 1,
        reason: "Correct CID while keeping the same Place ID",
        idempotencyKey: randomUUID(),
        patch: {
          mapsUrl: "https://www.google.com/maps?cid=12345678901234567890&query_place_id=ChIJExact",
          identifiers: [
            {
              namespace: "google_business",
              engine: "google",
              type: "cid",
              value: "12345678901234567890",
            },
            {
              namespace: "google_business",
              engine: "google",
              type: "place_id",
              value: "ChIJExact",
            },
          ],
        },
      };
      const revised = await reviseBusinessLocationFor(command, scope.writerContext, fixture.db);
      const current = (
        await readBusinessLocationFor(
          scope.project.publicId,
          location.publicId,
          scope.writerContext,
          fixture.db,
        )
      ).location.currentRevision;
      expect(current.revision).toBe(2);
      expect(current.previousRevisionId).toBe(original.id);
      expect(current.snapshot.identifiers.find((id) => id.type === "place_id")).toEqual(
        original.snapshot.identifiers.find((id) => id.type === "place_id"),
      );
      expect(current.snapshot.identifiers.find((id) => id.type === "cid")).toMatchObject({
        value: "12345678901234567890",
        provenance: { source: "user", referenceId: null, recordedAt: current.effectiveFrom },
      });
      const storedOriginal = await fixture.db.businessIdentityRevision.findUniqueOrThrow({
        where: { id: original.id },
      });
      expect(storedOriginal.snapshot).toEqual(original.snapshot);
      expect(await reviseBusinessLocationFor(command, scope.writerContext, fixture.db)).toEqual({
        receipt: revised.receipt,
        replayed: true,
      });
      expect(
        await fixture.db.businessIdentifierClaim.count({ where: { projectId: scope.project.id } }),
      ).toBe(2);
      expect(fetch).not.toHaveBeenCalled();
    });

    it("refuses forged provenance and stale revision without adding history or replay authority", async () => {
      const { scope, location } = await retainedIdentity();
      const identifiers = location.currentRevision.snapshot.identifiers;
      const command = {
        projectId: scope.project.publicId,
        locationId: location.publicId,
        expectedRevision: 1,
        reason: "Synthetic identity edit",
        idempotencyKey: randomUUID(),
        patch: { identifiers: identifiers.map(({ provenance: _provenance, ...id }) => id) },
      };
      await expect(
        reviseBusinessLocationFor(
          { ...command, patch: { identifiers } },
          scope.writerContext,
          fixture.db,
        ),
      ).rejects.toThrow();
      await reviseBusinessLocationFor(
        { ...command, patch: { name: "Revised name" } },
        scope.writerContext,
        fixture.db,
      );
      await expect(
        reviseBusinessLocationFor(
          { ...command, idempotencyKey: randomUUID() },
          scope.writerContext,
          fixture.db,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(
        await fixture.db.businessIdentityRevision.count({ where: { projectId: scope.project.id } }),
      ).toBe(2);
      expect(
        await fixture.db.businessLocationMutation.count({ where: { projectId: scope.project.id } }),
      ).toBe(2);
      expect(fetch).not.toHaveBeenCalled();
    });
  },
);
