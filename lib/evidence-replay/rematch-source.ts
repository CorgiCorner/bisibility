import "server-only";
import type { BusinessTransaction } from "@/lib/business-location-store/context";
import { projectRetainedBusinessObservation } from "@/lib/business-location-store/observation-read";
import { readLocalResultBinding } from "@/lib/local-monitor-results/binding";
import { localPointEvidence, resultObservationSelect } from "@/lib/local-monitor-results/evidence";
import { assertLocalCustody } from "@/lib/local-monitoring-store/custody";
import { bindingSchema } from "@/lib/measurement-definitions/storage";
import { assertObservationOriginalBinding } from "@/lib/observation/persist-definition";
import { z } from "zod";
import { replayDigest } from "./hash";
import { EvidenceReplayUnavailableError } from "./model";

const webPolicy = z
  .object({
    depth: z.number().int().positive(),
    stopOnMatch: z.boolean(),
    findTargetsIn: z.string().nullable().optional(),
    forcedAiOverview: z.literal(false),
    evidence: z
      .object({
        version: z.literal(1),
        adapterVersion: z.string(),
        targetRevision: z.string(),
        policyRevision: z.string(),
        observedAt: z.iso.datetime(),
        requestedAt: z.iso.datetime().nullable(),
        completeThrough: z.partialRecord(
          z.enum(["organic_result", "local_pack", "ai_overview", "map_listing", "listing"]),
          z.number().nullable(),
        ),
      })
      .passthrough(),
  })
  .passthrough();
const packIdentityProof = z
  .object({ version: z.literal(1), identityIssues: z.number().int().nonnegative() })
  .passthrough();
const webScope = z.object({ location: z.string(), language: z.string(), device: z.string() });
/** Original normalized collection + original winning owner only. No current definition reconstruction. */
export async function retainedRematchSource(
  tx: BusinessTransaction,
  projectId: string,
  observationRunId: string,
  asOf: Date,
) {
  const row = await tx.observationRun.findFirst({
    where: { id: observationRunId, projectId },
    select: {
      ...resultObservationSelect,
      definitionBindingId: true,
      rankCheckId: true,
      rankCheck: { select: { normalizationVersion: true, keywordId: true } },
    },
  });
  if (
    !row ||
    row.createdAt > asOf ||
    row.items.length > 700 ||
    row.items.some((item) => item.observedAt !== null && item.observedAt > asOf)
  )
    throw new EvidenceReplayUnavailableError();
  const policyRecord =
    row.requestPolicy && typeof row.requestPolicy === "object" && !Array.isArray(row.requestPolicy)
      ? row.requestPolicy
      : null;
  if (
    Number(policyRecord?.identityIssueCount ?? 0) > 0 ||
    row.items.some((item) => {
      const fragment = item.rawFragment;
      return (
        fragment &&
        typeof fragment === "object" &&
        !Array.isArray(fragment) &&
        Array.isArray(fragment.identityIssues) &&
        fragment.identityIssues.length > 0
      );
    })
  )
    throw new EvidenceReplayUnavailableError();
  let owner: unknown;
  if (row.surface === "web_serp" && row.engine === "google") {
    if (!row.definitionBindingId || !row.rankCheckId || !row.rankCheck)
      throw new EvidenceReplayUnavailableError();
    const bindings = await tx.$queryRaw<
      unknown[]
    >`SELECT id,"projectId","keywordId","targetRevisionId" AS "targetRevision","policyRevisionId" AS "policyRevision",owner,request,source,"capturedAt" FROM measurement_execution_bindings WHERE id=${row.definitionBindingId} AND "projectId"=${projectId} AND "rankCheckId"=${row.rankCheckId}`;
    if (bindings.length !== 1) throw new EvidenceReplayUnavailableError();
    const binding = bindingSchema.parse(bindings[0]),
      policy = webPolicy.parse(row.requestPolicy);
    // G4 retains aggregate identity anomalies independently of expiring raw fragments.
    const pack = packIdentityProof.safeParse(policy.evidence.webLocalPack);
    if (
      row.items.some((item) => item.resultKind === "local_pack") &&
      (!pack.success || pack.data.identityIssues !== 0)
    )
      throw new EvidenceReplayUnavailableError();
    const proof = assertObservationOriginalBinding(binding, projectId, row.rankCheckId, {
      provider: row.provider,
      engine: "google",
      surface: "web_serp",
      requestPolicy: policy,
      configuredScope: webScope.parse(row.configuredScope),
      completeness: "unknown",
      items: [],
      executedAt: row.executedAt,
    });
    if (
      binding.keywordId !== row.rankCheck.keywordId ||
      proof.targetRevision !== binding.targetRevision ||
      proof.policyRevision !== binding.policyRevision
    )
      throw new EvidenceReplayUnavailableError();
    owner = binding;
  } else if (row.surface === "maps" || row.surface === "local_finder") {
    if (!row.neutralExecutionItemId || row.rankCheckId || row.definitionBindingId)
      throw new EvidenceReplayUnavailableError();
    const item = await tx.localMeasurementRunItem.findFirst({
      where: { id: row.neutralExecutionItemId, projectId },
    });
    const occurrence = item
      ? await tx.localMonitorOccurrence.findFirst({ where: { projectId, runId: item.runId } })
      : null;
    const monitor = occurrence
      ? await tx.localMonitor.findFirst({
          where: { projectId, id: occurrence.monitorId },
          select: { publicId: true },
        })
      : null;
    const run = item
      ? await tx.localMeasurementRun.findFirst({
          where: { projectId, id: item.runId },
          select: { publicId: true },
        })
      : null;
    if (!monitor || !run) throw new EvidenceReplayUnavailableError();
    const binding = await readLocalResultBinding(
      tx,
      projectId,
      monitor.publicId,
      run.publicId,
      asOf,
    );
    const original = binding.rows.find((value) => value.item.id === row.neutralExecutionItemId);
    if (!original || original.record.status !== "accepted")
      throw new EvidenceReplayUnavailableError();
    await assertLocalCustody(tx, original.item, original.record);
    const decisions = await tx.businessMatchDecision.findMany({
      where: {
        projectId,
        entityId: binding.definition.entityId,
        identityRevisionId: binding.definition.identityRevisionId,
        observationRunId,
        decisionRevision: 1,
      },
    });
    const proof = localPointEvidence(
      original,
      row,
      decisions,
      binding.definition.identityRevisionId,
      asOf,
    );
    if (proof.qualityReason === "missing_observation_time")
      throw new EvidenceReplayUnavailableError();
    owner = { original, definition: binding.definition, originalDecisions: decisions };
  } else throw new EvidenceReplayUnavailableError();
  // Existing projection retains opaque IDs, promotion and original ordinals. It refuses unknown time.
  const retained = projectRetainedBusinessObservation(row);
  if (retained.items.some((item) => Date.parse(item.observedAt) > asOf.getTime()))
    throw new EvidenceReplayUnavailableError();
  return {
    sourceHash: replayDigest({ row, owner }),
    itemIds: retained.items.map((item) => item.itemId),
    surface: row.surface,
  };
}
