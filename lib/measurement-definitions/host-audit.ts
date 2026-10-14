import "server-only";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import type { DefinitionAuditPort } from "./model";

/** Attribution only. Authority was renewed by the producer/configuration service in this transaction. */
export const recordHostDefinitionMutation: DefinitionAuditPort = async (tx, event) => {
  const project = await tx.project.findUnique({
    where: { id: event.projectId },
    select: { publicId: true },
  });
  if (!project) throw new Error("Measurement audit project is unavailable.");
  await writeAudit(
    {
      actorId: event.actorId,
      projectId: event.projectId,
      action: `measurement_definition.${event.operation}`,
      targetType: "project_defaults",
      targetId: requiredPublicAuditId(project.publicId, "prj", "Measurement policy"),
      after: {
        operation: event.operation,
        revisionId: event.revisionId,
        previousRevisionId: event.previousRevisionId,
      },
    },
    tx,
  );
};
