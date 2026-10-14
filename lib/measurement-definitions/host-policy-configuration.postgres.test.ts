import { previewSourceHash } from "@/lib/rank-check/runs/preview-source-hash";
import { describe, expect, it } from "vitest";
import { DefinitionConflictError } from "./errors";
import { configureHostDefinitionPolicy } from "./host-policy-configuration";
import { readHostDefinitionPolicy } from "./host-policy-snapshot";
import { definitionDatabaseFixture } from "./postgres.test-fixture";

/** Requires reviewed complete migration chain in an owned isolated database. AUTHORED_NOT_RUN. */
describe("actual host policy configuration", () => {
  it("read first-use stays unknown and explicit CAS initializes null freshness", async () => {
    const f = await definitionDatabaseFixture();
    try {
      const projectId = f.project.project.publicId;
      const actor = { id: f.project.writer.id };
      const before = await readHostDefinitionPolicy(f.db, { actor }, projectId);
      expect(before.state).toBe("unconfigured");
      const repeated = await readHostDefinitionPolicy(f.db, { actor }, projectId);
      expect(repeated).toEqual(before);
      const result = await configureHostDefinitionPolicy(
        f.db,
        { actor },
        {
          projectId,
          expectedPolicyEpoch: before.policyEpoch,
          manualTtlMs: null,
          cadenceGraceMs: null,
          confirmed: true,
        },
      );
      const after = await readHostDefinitionPolicy(f.db, { actor }, projectId);
      expect(after.state).toBe("ready");
      expect(after.policyEpoch).toBe(result.policyEpoch);
      expect(after.config?.freshness.manualTtlMs).toBeNull();
      expect(after.config?.freshness.cadenceGraceMs).toBeNull();
      expect(
        await f.db.measurementDefinitionHead.count({ where: { projectId: f.project.project.id } }),
      ).toBe(0);
    } finally {
      await f.close();
    }
  });
  it("semantic A to B to A epochs invalidate old signed sources; no-op retains epoch", async () => {
    const f = await definitionDatabaseFixture();
    try {
      const context = { actor: { id: f.project.writer.id } },
        projectId = f.project.project.publicId;
      const initial = await readHostDefinitionPolicy(f.db, context, projectId);
      const input = {
        projectId,
        expectedPolicyEpoch: initial.policyEpoch,
        manualTtlMs: null,
        cadenceGraceMs: null,
        confirmed: true as const,
      };
      await configureHostDefinitionPolicy(f.db, context, input);
      const a = await readHostDefinitionPolicy(f.db, context, projectId);
      const source = {
        domain: "example.test",
        stopOnMatch: true,
        rows: [],
        depths: [],
        provider: null,
      };
      const hashA = previewSourceHash({ ...source, measurementPolicy: a });
      const noop = await configureHostDefinitionPolicy(f.db, context, {
        ...input,
        expectedPolicyEpoch: a.policyEpoch,
      });
      expect(noop.changed).toBe(false);
      expect(noop.policyEpoch).toBe(a.policyEpoch);
      await configureHostDefinitionPolicy(f.db, context, {
        ...input,
        expectedPolicyEpoch: a.policyEpoch,
        manualTtlMs: 1000,
      });
      const b = await readHostDefinitionPolicy(f.db, context, projectId);
      await expect(
        configureHostDefinitionPolicy(f.db, context, {
          ...input,
          expectedPolicyEpoch: a.policyEpoch,
        }),
      ).rejects.toBeInstanceOf(DefinitionConflictError);
      await configureHostDefinitionPolicy(f.db, context, {
        ...input,
        expectedPolicyEpoch: b.policyEpoch,
      });
      const a2 = await readHostDefinitionPolicy(f.db, context, projectId);
      expect(a2.config).toEqual(a.config);
      expect(previewSourceHash({ ...source, measurementPolicy: a2 })).not.toBe(hashA);
    } finally {
      await f.close();
    }
  });
  it("uses current membership and writeMode rather than cached owner flags", async () => {
    const f = await definitionDatabaseFixture();
    try {
      const projectId = f.project.project.publicId;
      const view = await readHostDefinitionPolicy(f.db, f.project.ownerContext, projectId);
      const input = {
        projectId,
        expectedPolicyEpoch: view.policyEpoch,
        manualTtlMs: null,
        cadenceGraceMs: null,
        confirmed: true,
      };
      await expect(
        configureHostDefinitionPolicy(f.db, f.project.ownerContext, input),
      ).rejects.toMatchObject({ code: "forbidden" });
      await f.db.membership.updateMany({
        where: { userId: f.project.writer.id, projectId: f.project.project.id },
        data: { role: "viewer" },
      });
      await expect(
        configureHostDefinitionPolicy(f.db, f.project.writerContext, input),
      ).rejects.toMatchObject({ code: "forbidden" });
      await f.db.membership.updateMany({
        where: { userId: f.project.writer.id, projectId: f.project.project.id },
        data: { role: "member" },
      });
      await f.db.project.update({
        where: { id: f.project.project.id },
        data: { writeMode: "migration_hold" },
      });
      await expect(
        configureHostDefinitionPolicy(f.db, f.project.writerContext, input),
      ).rejects.toThrow();
      expect(
        (await readHostDefinitionPolicy(f.db, f.project.writerContext, projectId)).config,
      ).toBeNull();
      expect(
        await f.db.auditLog.count({
          where: { projectId: f.project.project.id, action: "measurement_definition.configure" },
        }),
      ).toBe(0);
    } finally {
      await f.close();
    }
  });
});
