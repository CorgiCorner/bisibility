import "server-only";
import { randomUUID } from "node:crypto";
import { requireExplicitSubject } from "@/lib/business-locations/identity-revisions";
import { readAssignmentHead, resolveAssignmentScope } from "./assignment-repository";
import type { BusinessDatabase, BusinessStoreContext } from "./context";
import { BusinessLocationConflictError } from "./errors";
import { assertLocationVersion, loadBusinessLocation } from "./location-repository";
import { mutateBusiness } from "./mutation";
import { assignLocationSchema } from "./schema";

export async function assignBusinessLocationFor(
  input: unknown,
  context: BusinessStoreContext,
  db?: BusinessDatabase,
) {
  const data = assignLocationSchema.parse(input);
  return mutateBusiness({
    data,
    context,
    db,
    operation: "assign_location",
    resource: "business_assignment",
    async execute(tx, scope, now) {
      const reference = await resolveAssignmentScope(tx, scope.project.id, data.scope);
      const existing = await readAssignmentHead(
        tx,
        scope.project.id,
        reference.scopeType,
        reference.scopeId,
      );
      if (
        (existing?.head.version ?? 0) !== data.expectedRevision ||
        (existing?.current && existing.current.effectiveFrom > now)
      )
        throw new BusinessLocationConflictError();
      assertLocationVersion(existing?.head.version ?? 0);
      const target = data.target
        ? (await loadBusinessLocation(tx, scope.project.id, data.target.locationId)).location
        : null;
      if (target)
        requireExplicitSubject([target], {
          projectId: scope.project.id,
          entityId: target.id,
          identityRevisionId: data.target!.identityRevisionId,
        });
      const head =
        existing?.head ??
        (await tx.businessAssignmentHead.create({
          data: { projectId: scope.project.id, ...reference },
        }));
      const revision = await tx.businessAssignmentRevision.create({
        data: {
          id: randomUUID(),
          headId: head.id,
          projectId: scope.project.id,
          revision: head.version + 1,
          previousRevisionId: existing?.current?.id ?? null,
          entityId: target?.id ?? null,
          identityRevisionId: target?.currentRevision.id ?? null,
          effectiveFrom: now,
          actorId: scope.actor.id,
          reason: data.reason,
        },
      });
      const updated = await tx.businessAssignmentHead.updateMany({
        where: {
          id: head.id,
          projectId: scope.project.id,
          version: head.version,
          currentRevisionId: head.currentRevisionId,
        },
        data: { currentRevisionId: revision.id, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new BusinessLocationConflictError();
      return {
        receipt: { kind: "assignment", headId: head.id, revisionId: revision.id },
        audit: {
          action: target ? "business_assignment.assign" : "business_assignment.unassign",
          targetType: "business_assignment",
          targetId: scope.project.publicId,
          after: {
            operation: target ? "assign" : "unassign",
            revisionId: revision.id,
            previousId: revision.previousRevisionId,
            revision: revision.revision,
          },
        },
      };
    },
  });
}
