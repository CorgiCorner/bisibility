import { randomUUID } from "node:crypto";
import {
  businessLocationDatabase,
  seedBusinessProject,
  seedRetainedObservation,
} from "@/lib/business-location-store/postgres.test-fixture";
import { makePublicId } from "@/lib/db/public-id-resources";
import { DefinitionUnavailableError } from "./errors";
import { definitionSourceFixture } from "./fixtures";
import type { CaptureDefinitionInput, DefinitionProducerPorts } from "./model";

/** Existing full-schema owned fixture. Proposed SQL must first be materialized into the host migration chain. */
export async function definitionDatabaseFixture() {
  const fixture = await businessLocationDatabase();
  try {
    const intact = await fixture.client.query(
      "SELECT measurement_definition_authority_intact() AS intact",
    );
    if (!intact.rows[0]?.intact)
      throw new Error(
        "Reviewed definition-authority SQL must be materialized before executing this source suite.",
      );
    const project = await seedBusinessProject(fixture);
    const retained = await seedRetainedObservation(fixture, project.project.id);
    const rankCheckId = retained.run.rankCheckId;
    if (!rankCheckId) throw new Error("Definition fixture requires its persisted rank check.");
    const observation = { ...retained, run: { ...retained.run, rankCheckId } };
    const config = definitionSourceFixture().policy.config!;
    const host: DefinitionProducerPorts = {
      assertOwnExecution: async (tx, owner, input) => {
        const check = await tx.rankCheck.findFirst({
          where: {
            id: owner.rankCheckId,
            keywordId: input.keywordId,
            keyword: { projectId: input.projectId },
          },
          select: { id: true },
        });
        if (!check) throw new DefinitionUnavailableError();
        return { kind: "user" as const, actorId: project.writer.id };
      },
      assertImplementedAdapter: async (_tx, source, providerId) => {
        if (!source.policy.config?.adapters.some((entry) => entry.providerId === providerId))
          throw new DefinitionUnavailableError();
      },
      // Synthetic in-transaction persistence verifies rollback, not the production audit declaration registry.
      recordMutation: async (tx, event) => {
        await tx.auditLog.create({
          data: {
            publicId: makePublicId("audit"),
            action: "measurement_definition.fixture",
            actorId: event.actorId,
            projectId: event.projectId,
            targetId: project.project.publicId,
            targetType: "project",
            after: { operation: event.operation, revisionId: event.revisionId },
          },
        });
      },
    };
    const input: CaptureDefinitionInput = {
      projectId: project.project.id,
      keywordId: observation.keyword.id,
      providerId: "synthetic",
      owner: {
        rankCheckId: observation.run.rankCheckId,
        executionKey: randomUUID(),
        queuedTaskId: null,
      },
    };
    return { ...fixture, project, observation, input, host, config };
  } catch (error) {
    await fixture.close();
    throw error;
  }
}
