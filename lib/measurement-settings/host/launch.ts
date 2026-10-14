import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ProjectReadOnlyError } from "@/lib/deployment/project-write-mode";
import {
  assertDefinitionActor,
  definitionProjectScope,
} from "@/lib/measurement-definitions/access";
import type { PaidLaunchCommand } from "@/lib/measurement-settings/ui-contracts";
import { APP_REQUEST_ORIGIN } from "@/lib/provider-usage/surface";
import { launchRankCheckRun } from "@/lib/rank-check/runs/launch";
import { apiIdempotencyKey, findIdempotentRun } from "@/lib/rank-check/runs/launch-idempotency";
import type { SerpDepth } from "@/lib/serp/constants";
import type { SettingsHostContext, SettingsHostTransaction } from "./contracts";
import { SettingsHostError } from "./errors";
import { settingsActorScope, settingsHash } from "./hash";
import { settingsManualEvidence } from "./manual";
import { assertSettingsSnapshot } from "./preview";
import { verifiedManualConsent } from "./reviewed-consent";
import { hostLaunchSchema } from "./schema";
import { assertSettingsSelection, settingsManualSpec } from "./selection";
import { loadSettingsSource } from "./source";

export async function launchMeasurementSettingsHost(
  context: SettingsHostContext,
  input: PaidLaunchCommand,
) {
  const data = hostLaunchSchema.parse(input);
  const { idempotencyKey: callerKey, ...body } = data;
  const bodyHash = settingsHash("manual-body", body);
  const original = await prisma.$transaction(async (tx) => {
    const scoped = await definitionProjectScope(tx, context, data.projectId, "update", "keyword");
    const project = await tx.project.findUniqueOrThrow({
      where: { id: scoped.id },
      select: { id: true, domain: true, isSample: true, publicId: true },
    });
    const actorScopeHash = settingsActorScope(project.id, context.actor.id);
    const key = `measurement-${settingsHash("manual-key", { actorScopeHash, projectId: project.id, callerKey })}`;
    const attribution = { actorScopeHash, bodyHash };
    const replay = await findIdempotentRun(project.id, apiIdempotencyKey(key), tx);
    if (replay) {
      await assertOriginalRun(
        tx,
        project.id,
        context.actor.id,
        apiIdempotencyKey(key),
        attribution,
      );
      return { kind: "replay" as const, replay };
    }
    const source = await loadSettingsSource(tx, context, data.projectId, data.scheduleId);
    assertSettingsSnapshot(source, data);
    assertSettingsSelection(source, data.intent);
    if (
      data.providerId !== data.intent.providerId ||
      data.capabilityVersion !== data.intent.capabilityVersion ||
      data.depth !== data.intent.depth
    )
      throw new SettingsHostError("invalid_settings");
    return {
      kind: "new" as const,
      project,
      key,
      attribution,
      spec: settingsManualSpec(source, data.intent),
    };
  });
  if (original.kind === "replay") return original.replay;
  return launchRankCheckRun(
    {
      project: original.project,
      actorId: context.actor.id,
      origin: APP_REQUEST_ORIGIN,
      trigger: "manual",
      providerId: data.providerId,
      depth: data.depth as SerpDepth,
      spec: original.spec,
      previewToken: data.previewToken,
      idempotencyKey: original.key,
    },
    {
      attribution: original.attribution,
      // Same actor/share then canonical native advisory/project/source locks; no inverted lock protocol.
      assertActor: (tx) =>
        assertDefinitionActor(tx, context.actor.id, original.project.id, "update", "keyword"),
      assertReplay: (client, key) =>
        assertOriginalRun(client, original.project.id, context.actor.id, key, original.attribution),
      assertAdmission: async (tx) => {
        const current = await tx.project.findUnique({
          where: { id: original.project.id },
          select: { writeMode: true, isSample: true },
        });
        if (!current || current.writeMode !== "active" || current.isSample)
          throw new ProjectReadOnlyError(original.project.id);
        const source = await loadSettingsSource(tx, context, data.projectId, data.scheduleId);
        assertSettingsSnapshot(source, data);
        const manual = await settingsManualEvidence(tx, source, data.intent, new Date());
        return verifiedManualConsent(
          data.measurementToken,
          {
            projectId: original.project.id,
            actorId: context.actor.id,
            providerId: data.providerId,
            depth: data.depth as SerpDepth,
            selection: { selection: data.intent, scheduleId: data.scheduleId },
            source: { sourceHash: source.sourceHash, manual, nativeToken: data.previewToken },
          },
          new Date(),
        );
      },
    },
  );
}
async function assertOriginalRun(
  client: Pick<SettingsHostTransaction, "rankCheckRun">,
  projectId: string,
  actorId: string,
  key: string | undefined,
  expected: { actorScopeHash: string; bodyHash: string },
) {
  if (!key) throw new SettingsHostError("mutation_conflict");
  const row = await client.rankCheckRun.findUnique({
    where: { projectId_idempotencyKey: { projectId, idempotencyKey: key } },
    select: { projectId: true, requestedById: true, selectionSpec: true },
  });
  const spec = row?.selectionSpec;
  const proof =
    spec && typeof spec === "object" && !Array.isArray(spec)
      ? spec.measurementSettingsIntent
      : null;
  if (
    !row ||
    row.projectId !== projectId ||
    row.requestedById !== actorId ||
    !proof ||
    typeof proof !== "object" ||
    Array.isArray(proof) ||
    proof.actorScopeHash !== expected.actorScopeHash ||
    proof.bodyHash !== expected.bodyHash
  )
    throw new SettingsHostError("mutation_conflict");
}
