import { randomUUID } from "node:crypto";
import { createBusinessLocationFor } from "@/lib/business-location-store/location-write";
import {
  type BusinessPgFixture,
  identityCommand,
} from "@/lib/business-location-store/postgres.test-fixture";
import { makePublicId } from "@/lib/db/public-id-resources";
import { frozenConfiguredScope } from "@/lib/measurement-definitions/canonical";
import { definitionSourceFixture } from "@/lib/measurement-definitions/fixtures";
import type { DefinitionProducerPorts } from "@/lib/measurement-definitions/model";
import { configureDefinitionPolicy } from "@/lib/measurement-definitions/policy-config";
import { captureDefinitionBeforeIo } from "@/lib/measurement-definitions/producer";
import { seedReplayProject } from "./postgres.test-fixture";
export async function seedBoundRematch(fixture: BusinessPgFixture) {
  const value = await seedReplayProject(fixture, 0),
    context = { actor: { id: value.writer.id, memberships: [] } };
  await fixture.db.membership.updateMany({
    where: { projectId: value.project.id, userId: value.writer.id },
    data: { role: "admin" },
  });
  const recordMutation: DefinitionProducerPorts["recordMutation"] = async (tx, event) => {
    await tx.auditLog.create({
      data: {
        publicId: makePublicId("audit"),
        actorId: event.actorId,
        projectId: event.projectId,
        action: "measurement_definition.fixture",
        targetId: value.project.publicId,
        targetType: "project",
        after: { operation: event.operation },
      },
    });
  };
  const config = definitionSourceFixture().policy.config;
  const epoch = (
    await fixture.client.query(
      'SELECT "measurementPolicyEpoch"::text AS epoch FROM projects WHERE id=$1',
      [value.project.id],
    )
  ).rows[0].epoch;
  await configureDefinitionPolicy(
    fixture.db,
    context,
    { projectId: value.project.publicId, expectedPolicyEpoch: epoch, config },
    recordMutation,
  );
  const check = await fixture.db.rankCheck.create({
    data: {
      keywordId: value.keyword.id,
      publicId: makePublicId("check"),
      provider: "synthetic",
      status: "running",
      requestedDepth: 100,
    },
  });
  const host: DefinitionProducerPorts = {
    recordMutation,
    assertOwnExecution: async (tx, owner, input) => {
      const actual = await tx.rankCheck.findFirst({
        where: {
          id: owner.rankCheckId,
          keywordId: input.keywordId,
          provider: input.providerId,
          keyword: { projectId: input.projectId },
        },
        select: { id: true },
      });
      if (!actual || input.projectId !== value.project.id || owner.queuedTaskId !== null)
        throw new Error("synthetic own check unavailable");
      return { kind: "user", actorId: value.writer.id };
    },
    assertImplementedAdapter: async (_tx, source, id, request) => {
      if (
        !source.policy.config?.adapters.some(
          (adapter) =>
            adapter.providerId === id && adapter.adapterVersion === request.adapterVersion,
        )
      )
        throw new Error("synthetic adapter unavailable");
    },
  };
  const run = await fixture.db.$transaction(async (tx) => {
    const binding = await captureDefinitionBeforeIo(
      tx,
      {
        projectId: value.project.id,
        keywordId: value.keyword.id,
        providerId: "synthetic",
        owner: { rankCheckId: check.id, executionKey: randomUUID(), queuedTaskId: null },
      },
      host,
    );
    await tx.rankCheck.update({
      where: { id: check.id },
      data: { status: "completed", checkedAt: new Date(), normalizationVersion: "synthetic-v1" },
    });
    return tx.observationRun.create({
      data: {
        rankCheckId: check.id,
        definitionBindingId: binding.id,
        projectId: value.project.id,
        provider: "synthetic",
        surface: "web_serp",
        engine: "google",
        completeness: "unknown",
        configuredScope: frozenConfiguredScope(binding.source.target),
        executedAt: new Date(),
        requestPolicy: {
          depth: binding.request.depth,
          stopOnMatch: binding.request.stopOnMatch,
          findTargetsIn: binding.request.findTargetsIn,
          forcedAiOverview: false,
          evidence: {
            version: 1,
            adapterVersion: binding.request.adapterVersion,
            targetRevision: binding.targetRevision,
            policyRevision: binding.policyRevision,
            observedAt: new Date().toISOString(),
            requestedAt: null,
            webLocalPack: {
              version: 1,
              identityIssues: 0,
              scopeSource: null,
              completeness: "unknown",
            },
            completeThrough: { local_pack: null, organic_result: null },
          },
        },
      },
    });
  });
  const policy = run.requestPolicy as { evidence: { observedAt: string } };
  const item = await fixture.db.observationItem.create({
    data: {
      observationRunId: run.id,
      resultKind: "local_pack",
      ordinal: 0,
      cid: "123456789123456789",
      businessName: "Żółta firma",
      domain: "example.test",
      promotion: "organic",
      rankScale: "pack_slot",
      blockPosition: 1,
      positionInBlock: 3,
      sourcePage: 1,
      sourceOrdinal: 0,
      sourceBlockId: "actual-original-block",
      observedAt: new Date(policy.evidence.observedAt),
      rawFragment: { identityIssues: [] },
    },
  });
  const identity = await createBusinessLocationFor(
    identityCommand(value.project.publicId, item.cid!),
    context,
    fixture.db,
  );
  if (identity.receipt.kind !== "identity")
    throw new Error("synthetic identity receipt unavailable");
  const command = {
    projectId: value.project.publicId,
    locationId: identity.receipt.publicId,
    identityRevisionId: identity.receipt.revisionId,
    observationRunId: run.id,
    idempotencyKey: randomUUID(),
    expectedDecisions: [{ itemId: item.id, expectedRevision: 0 }],
  };
  return { ...value, context, run, item, command };
}
