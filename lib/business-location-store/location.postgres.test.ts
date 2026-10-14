import { randomUUID } from "node:crypto";
import * as audit from "@/lib/auth/audit";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
} from "./postgres.test-fixture";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/audit", async (original) => ({
  ...(await original<typeof import("@/lib/auth/audit")>()),
  writeAuditFailure: vi.fn(async () => undefined),
}));
describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)(
  "business location full-schema transactions",
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
    const create = (cid?: string) =>
      createBusinessLocationFor(
        identityCommand(scope.project.publicId, cid),
        scope.writerContext,
        fixture.db,
      );
    async function location(cid?: string) {
      const result = await create(cid);
      if (result.receipt.kind !== "identity") throw new Error("Expected identity receipt");
      return (
        await readBusinessLocationFor(
          scope.project.publicId,
          result.receipt.publicId,
          scope.writerContext,
          fixture.db,
        )
      ).location;
    }
    it("uses actual membership rather than project owner or stale caller roles", async () => {
      const input = identityCommand(scope.project.publicId);
      await expect(
        createBusinessLocationFor(input, scope.ownerContext, fixture.db),
      ).rejects.toMatchObject({ code: "forbidden" });
      const result = await createBusinessLocationFor(input, scope.writerContext, fixture.db);
      await fixture.db.membership.update({
        where: { userId_projectId: { userId: scope.writer.id, projectId: scope.project.id } },
        data: { role: "viewer" },
      });
      await expect(
        createBusinessLocationFor(input, scope.writerContext, fixture.db),
      ).rejects.toMatchObject({ code: "forbidden" });
      if (result.receipt.kind !== "identity") throw new Error("Expected identity");
      expect(
        (
          await readBusinessLocationFor(
            scope.project.publicId,
            result.receipt.publicId,
            scope.ownerContext,
            fixture.db,
          )
        ).permissions.canWrite,
      ).toBe(false);
    });
    it("enforces project hold before idempotency replay", async () => {
      const input = identityCommand(scope.project.publicId);
      await createBusinessLocationFor(input, scope.writerContext, fixture.db);
      await fixture.db.project.update({
        where: { id: scope.project.id },
        data: { writeMode: "migration_hold" },
      });
      await expect(
        createBusinessLocationFor(input, scope.writerContext, fixture.db),
      ).rejects.toMatchObject({ status: 423 });
    });
    it("preserves exact opaque IDs, distinct branches and project-scoped claims", async () => {
      const a = await location("18446744073709551615");
      const b = await location("12345678901234567890");
      expect(a.currentRevision.snapshot.identifiers[0].value).toBe("18446744073709551615");
      expect(a.id).not.toBe(b.id);
      await expect(create("18446744073709551615")).rejects.toMatchObject({ status: 409 });
      const other = await seedBusinessProject(fixture);
      await expect(
        createBusinessLocationFor(
          identityCommand(other.project.publicId, "18446744073709551615"),
          other.writerContext,
          fixture.db,
        ),
      ).resolves.toMatchObject({ replayed: false });
    });
    it("returns one immutable receipt on replay and rejects changed body", async () => {
      const input = identityCommand(scope.project.publicId);
      const first = await createBusinessLocationFor(input, scope.writerContext, fixture.db);
      expect(await createBusinessLocationFor(input, scope.writerContext, fixture.db)).toEqual({
        receipt: first.receipt,
        replayed: true,
      });
      await expect(
        createBusinessLocationFor(
          { ...input, identity: { ...input.identity, name: "Changed" } },
          scope.writerContext,
          fixture.db,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(
        await fixture.db.businessIdentityRevision.count({ where: { projectId: scope.project.id } }),
      ).toBe(1);
    });
    it("allows exactly one concurrent expected-revision edit and rolls back stale history", async () => {
      const initial = await location();
      const command = {
        projectId: scope.project.publicId,
        locationId: initial.publicId,
        expectedRevision: 1,
        reason: "Synthetic change",
      };
      const edits = await Promise.allSettled(
        ["First", "Second"].map((name) =>
          reviseBusinessLocationFor(
            { ...command, idempotencyKey: randomUUID(), patch: { name } },
            scope.writerContext,
            fixture.db,
          ),
        ),
      );
      expect(edits.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
      expect(edits.find(({ status }) => status === "rejected")).toMatchObject({
        reason: { status: 409 },
      });
      expect(
        await fixture.db.businessIdentityRevision.count({ where: { projectId: scope.project.id } }),
      ).toBe(2);
    });
    it("rolls back all identity, claim and replay state when audit storage fails", async () => {
      const failing = vi
        .spyOn(audit, "writeAudit")
        .mockRejectedValueOnce(new Error("Synthetic audit storage failure"));
      try {
        await expect(create("18446744073709551615")).rejects.toThrow("audit storage");
      } finally {
        failing.mockRestore();
      }
      for (const count of [
        await fixture.db.businessLocation.count({ where: { projectId: scope.project.id } }),
        await fixture.db.businessIdentityRevision.count({ where: { projectId: scope.project.id } }),
        await fixture.db.businessIdentifierClaim.count({ where: { projectId: scope.project.id } }),
        await fixture.db.businessLocationMutation.count({ where: { projectId: scope.project.id } }),
      ])
        expect(count).toBe(0);
    });
    it("archives without deleting revisions and excludes address/CID from actual audit payload", async () => {
      const initial = await location("18446744073709551615");
      await setBusinessLocationStateFor(
        {
          projectId: scope.project.publicId,
          locationId: initial.publicId,
          expectedVersion: initial.version,
          state: "archived",
          idempotencyKey: randomUUID(),
        },
        scope.writerContext,
        fixture.db,
      );
      expect(
        (
          await readBusinessLocationFor(
            scope.project.publicId,
            initial.publicId,
            scope.ownerContext,
            fixture.db,
          )
        ).history,
      ).toHaveLength(1);
      expect(
        await fixture.db.businessIdentifierClaim.count({ where: { projectId: scope.project.id } }),
      ).toBe(0);
      const logs = JSON.stringify(
        await fixture.db.auditLog.findMany({ where: { projectId: scope.project.id } }),
      );
      expect(logs).not.toContain("Synthetic private address");
      expect(logs).not.toContain("18446744073709551615");
    });
    it("rejects unsafe numeric IDs and client-provided observation provenance before mutation", async () => {
      const input = identityCommand(scope.project.publicId);
      const identifier = {
        namespace: "google_business",
        engine: "google",
        type: "cid",
        value: 9007199254740994,
      };
      await expect(
        createBusinessLocationFor(
          { ...input, identity: { ...input.identity, identifiers: [identifier] } },
          scope.writerContext,
          fixture.db,
        ),
      ).rejects.toThrow();
      await expect(
        createBusinessLocationFor(
          {
            ...input,
            identity: {
              ...input.identity,
              identifiers: [
                {
                  ...identifier,
                  value: "18446744073709551615",
                  provenance: {
                    source: "retained_observation",
                    referenceId: "other-project-item",
                    recordedAt: new Date().toISOString(),
                  },
                },
              ],
            },
          },
          scope.writerContext,
          fixture.db,
        ),
      ).rejects.toThrow();
      expect(
        await fixture.db.businessLocation.count({ where: { projectId: scope.project.id } }),
      ).toBe(0);
    });
  },
);
