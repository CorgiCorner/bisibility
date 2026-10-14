import { requirePublicId } from "@/lib/db/public-id-resources";
import "server-only";
import { randomUUID } from "node:crypto";
import { makePublicId } from "@/lib/db/public-id-resources";
import type { Prisma } from "@/lib/generated/prisma/client";
import { businessWriteContext } from "./access";
import type { BusinessDatabase, BusinessStoreContext } from "./context";
import { BusinessLocationConflictError } from "./errors";
import { planStoredIdentity } from "./identity-plan";
import {
  assertLocationVersion,
  loadBusinessLocation,
  loadProjectLocations,
  replaceIdentifierClaims,
  userIdentityPatch,
} from "./location-repository";
import { mutateBusiness } from "./mutation";
import { createLocationSchema, reviseLocationSchema, stateLocationSchema } from "./schema";

export async function createBusinessLocationFor(
  input: unknown,
  context: BusinessStoreContext,
  db?: BusinessDatabase,
) {
  const data = createLocationSchema.parse(input);
  return mutateBusiness({
    data,
    context,
    db,
    operation: "create_location",
    action: "create",
    async execute(tx, scope, now) {
      const activeLocations = await loadProjectLocations(tx, scope.project.id, true);
      const row = await tx.businessLocation.create({
        data: {
          projectId: scope.project.id,
          publicId: makePublicId("biz"),
          role: data.role,
          state: "active",
          version: 0,
        },
      });
      const planned = planStoredIdentity({
        id: randomUUID(),
        entityId: row.id,
        projectId: scope.project.id,
        current: null,
        expectedRevision: 0,
        patch: userIdentityPatch(data.identity, now.toISOString()),
        activeLocations,
        context: businessWriteContext(scope),
        effectiveFrom: now.toISOString(),
        reason: data.reason,
        idempotencyKey: data.idempotencyKey,
      });
      const revision = planned.revision;
      await tx.businessIdentityRevision.create({
        data: {
          ...revision,
          effectiveFrom: now,
          snapshot: revision.snapshot as Prisma.InputJsonValue,
        },
      });
      await replaceIdentifierClaims(tx, row, revision);
      const updated = await tx.businessLocation.updateMany({
        where: { id: row.id, projectId: scope.project.id, version: 0, currentRevisionId: null },
        data: { currentRevisionId: revision.id, version: 1 },
      });
      if (updated.count !== 1) throw new BusinessLocationConflictError();
      return {
        receipt: {
          kind: "identity",
          entityId: row.id,
          publicId: requirePublicId(row.publicId, "biz"),
          revisionId: revision.id,
        },
        audit: {
          action: "business_location.create",
          targetType: "business_location",
          targetId: row.publicId,
          after: {
            operation: "create",
            revisionId: revision.id,
            previousId: null,
            revision: 1,
            version: 1,
          },
        },
      };
    },
  });
}

export async function reviseBusinessLocationFor(
  input: unknown,
  context: BusinessStoreContext,
  db?: BusinessDatabase,
) {
  const data = reviseLocationSchema.parse(input);
  return mutateBusiness({
    data,
    context,
    db,
    operation: "revise_location",
    async execute(tx, scope, now) {
      const { row, location } = await loadBusinessLocation(tx, scope.project.id, data.locationId);
      if (row.state !== "active") throw new BusinessLocationConflictError("state_conflict");
      if (location.currentRevision.revision !== data.expectedRevision)
        throw new BusinessLocationConflictError();
      assertLocationVersion(row.version);
      const planned = planStoredIdentity({
        id: randomUUID(),
        entityId: row.id,
        projectId: scope.project.id,
        current: location.currentRevision,
        expectedRevision: data.expectedRevision,
        patch: userIdentityPatch(
          data.patch,
          now.toISOString(),
          location.currentRevision.snapshot.identifiers,
        ),
        activeLocations: await loadProjectLocations(tx, scope.project.id, true),
        context: businessWriteContext(scope),
        effectiveFrom: now.toISOString(),
        reason: data.reason,
        idempotencyKey: data.idempotencyKey,
      });
      const revision = planned.revision;
      await tx.businessIdentityRevision.create({
        data: {
          ...revision,
          effectiveFrom: now,
          snapshot: revision.snapshot as Prisma.InputJsonValue,
        },
      });
      await replaceIdentifierClaims(tx, row, revision);
      const updated = await tx.businessLocation.updateMany({
        where: {
          id: row.id,
          projectId: scope.project.id,
          version: row.version,
          currentRevisionId: row.currentRevisionId,
        },
        data: { currentRevisionId: revision.id, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new BusinessLocationConflictError();
      return {
        receipt: {
          kind: "identity",
          entityId: row.id,
          publicId: requirePublicId(row.publicId, "biz"),
          revisionId: revision.id,
        },
        audit: {
          action: "business_location.revise",
          targetType: "business_location",
          targetId: row.publicId,
          after: {
            operation: "revise",
            revisionId: revision.id,
            previousId: revision.previousRevisionId,
            revision: revision.revision,
            version: row.version + 1,
          },
        },
      };
    },
  });
}

export async function setBusinessLocationStateFor(
  input: unknown,
  context: BusinessStoreContext,
  db?: BusinessDatabase,
) {
  const data = stateLocationSchema.parse(input);
  return mutateBusiness({
    data,
    context,
    db,
    operation: "set_location_state",
    async execute(tx, scope) {
      const { row, location } = await loadBusinessLocation(tx, scope.project.id, data.locationId);
      if (row.version !== data.expectedVersion) throw new BusinessLocationConflictError();
      assertLocationVersion(row.version);
      const changed = row.state !== data.state;
      if (changed) {
        await replaceIdentifierClaims(
          tx,
          row,
          data.state === "active" ? location.currentRevision : null,
        );
        const result = await tx.businessLocation.updateMany({
          where: { id: row.id, projectId: scope.project.id, version: row.version },
          data: { state: data.state, version: { increment: 1 } },
        });
        if (result.count !== 1) throw new BusinessLocationConflictError();
      }
      const version = row.version + (changed ? 1 : 0);
      return {
        receipt: {
          kind: "state",
          entityId: row.id,
          publicId: requirePublicId(row.publicId, "biz"),
          version,
        },
        audit: {
          action:
            data.state === "archived" ? "business_location.archive" : "business_location.restore",
          targetType: "business_location",
          targetId: row.publicId,
          after: {
            operation: data.state === "archived" ? "archive" : "restore",
            state: data.state,
            version,
            changedCount: changed ? 1 : 0,
          },
        },
      };
    },
  });
}
