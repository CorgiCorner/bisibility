import "server-only";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import type { Prisma } from "@/lib/generated/prisma/client";
import { persistRankCheckObservation } from "@/lib/observation/persist";
import type { WebObservationRunInput } from "@/lib/observation/types";
import { serpRankLocation } from "@/lib/serp/location";
import { assertComparisonHistoryWrite } from "./access";
import { parseComparisonSnapshot, requestUuid } from "./model";
import type { RetainedComparisonResult } from "./retained-result";
import type { ComparisonProvider } from "./types";

type SaveInput = {
  projectId: string;
  actorId: string;
  runId: string;
  provider: ComparisonProvider;
};
export class PlaygroundSaveMismatch extends Error {}
async function saveSource(tx: Prisma.TransactionClient, input: SaveInput) {
  await assertComparisonHistoryWrite(tx, input.projectId, input.actorId);
  const row = await tx.providerComparisonRun.findFirst({
    where: { id: input.runId, projectId: input.projectId, keywordId: null },
    include: { sides: true },
  });
  if (!row) throw new PlaygroundSaveMismatch();
  const snapshot = parseComparisonSnapshot(row.snapshot);
  const side = row.sides.find((side) => side.provider === input.provider);
  if (snapshot.version !== 2 || side?.status !== "completed" || !side.result)
    throw new PlaygroundSaveMismatch();
  const result = side.result as RetainedComparisonResult;
  await tx.$queryRaw`SELECT id FROM keywords WHERE "projectId"=${input.projectId} AND text=${snapshot.text} AND "locationId"=${snapshot.locationId} AND device::text=${snapshot.device} AND "archivedAt" IS NULL FOR SHARE`;
  const target = await tx.keyword.findFirst({
    where: {
      projectId: input.projectId,
      text: snapshot.text,
      locationId: snapshot.locationId,
      device: snapshot.device,
      archivedAt: null,
    },
    include: { locationRef: true, project: { select: { domain: true } } },
  });
  if (
    !target ||
    target.project.domain !== snapshot.domain ||
    ["gl", "hl", "primaryGeoCode", "primaryGeoName", "secondaryGeoName"].some(
      (key) =>
        serpRankLocation(target.locationRef)[key as keyof typeof snapshot.location] !==
        snapshot.location[key as keyof typeof snapshot.location],
    )
  )
    throw new PlaygroundSaveMismatch();
  const observation = result._capture?.observation;
  if (
    observation &&
    (observation.surface !== "web_serp" ||
      observation.engine !== "google" ||
      observation.provider !== side.provider ||
      observation.requestPolicy.depth !== (snapshot.depth ?? 20) ||
      observation.requestPolicy.stopOnMatch ||
      observation.requestPolicy.forcedAiOverview)
  )
    throw new PlaygroundSaveMismatch();
  const captured = snapshot.trackedTarget;
  // Existing stored checks remain their own provenance; new captures require the original target.
  if (
    !result._sourceCheckId &&
    (!captured ||
      captured.id !== target.id ||
      captured.targetUrl !== target.targetUrl ||
      captured.targetEpoch !== String(target.measurementTargetEpoch) ||
      captured.policyEpoch !== String(target.measurementPolicyEpoch))
  )
    throw new PlaygroundSaveMismatch();
  if (!result._capture && !result._sourceCheckId) throw new PlaygroundSaveMismatch();
  return { row, snapshot, side, result, target };
}
export async function previewPlaygroundSave(input: SaveInput) {
  requestUuid.parse(input.runId);
  return prisma.$transaction(async (tx) => {
    const { snapshot, side, result, target } = await saveSource(tx, input);
    return {
      keywordRef: target.publicId,
      keyword: target.text,
      location: snapshot.locationLabel,
      language: snapshot.location.hl,
      device: snapshot.device,
      provider: side.provider,
      date: result.observedAt ?? result.recordedAt,
    };
  });
}
export async function savePlaygroundResult(input: SaveInput, onCommitted?: () => void) {
  let written = false;
  requestUuid.parse(input.runId);
  const saved = await prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(["save-playground", input.projectId, input.runId, input.provider])},0))::text`;
      const { row, side, result, target, snapshot } = await saveSource(tx, input);
      const originalId = result._sourceCheckId;
      if (originalId)
        await tx.$queryRaw`SELECT id FROM rank_checks WHERE id=${originalId} AND "keywordId"=${target.id} AND provider=${input.provider} FOR SHARE`;
      const original = originalId
        ? await tx.rankCheck.findFirst({
            where: { id: originalId, keywordId: target.id, provider: input.provider },
            select: { publicId: true },
          })
        : null;
      if (originalId && !original) throw new PlaygroundSaveMismatch();
      if (result._savedCheckRef)
        return { checkRef: result._savedCheckRef, keywordRef: target.publicId };
      let checkRef = original?.publicId;
      if (!checkRef) {
        const capture = result._capture;
        if (!capture || !Number.isFinite(Date.parse(capture.checkedAt)))
          throw new PlaygroundSaveMismatch();
        const checkedAt = new Date(capture.checkedAt);
        const existing = await tx.rankCheck.findUnique({
          where: { keywordId_checkedAt: { keywordId: target.id, checkedAt } },
        });
        if (existing) throw new PlaygroundSaveMismatch();
        const created = await tx.rankCheck.create({
          data: {
            publicId: makePublicId("check"),
            keywordId: target.id,
            provider: input.provider,
            status: "completed",
            trigger: "manual",
            position: result.position,
            rankingUrl: result.rankingUrl,
            expectedUrlAtCheck: snapshot.trackedTarget?.targetUrl ?? null,
            checkedAt,
            finishedAt: checkedAt,
            terminalPersistedAt: new Date(),
            requestedDepth: snapshot.depth ?? 20,
            costCents: null,
            comparisonAllowed: false,
            normalizationVersion: result.normalizationVersion,
            raw: {
              ...capture.raw,
              ...(result._urlRepair ? { _urlRepair: result._urlRepair } : {}),
              playgroundSource: {
                runId: row.id,
                provider: input.provider,
                recordedAt: result.recordedAt,
              },
            } as Prisma.InputJsonValue,
          },
        });
        // Import the original observation without manufacturing an execution binding after the fact.
        if (capture.observation?.surface === "web_serp") {
          const observation = structuredClone(capture.observation) as WebObservationRunInput;
          observation.executedAt = new Date(observation.executedAt);
          observation.items = observation.items.map((item) => ({
            ...item,
            observedAt: item.observedAt ? new Date(item.observedAt) : item.observedAt,
          }));
          await persistRankCheckObservation(tx, observation, input.projectId, created.id);
        }
        checkRef = created.publicId;
      }
      await tx.providerComparisonSide.update({
        where: { id: side.id },
        data: {
          result: { ...result, _savedCheckRef: checkRef } as unknown as Prisma.InputJsonValue,
        },
      });
      written = true;
      return { checkRef, keywordRef: target.publicId };
    },
    { timeout: 20_000 },
  );
  if (written) onCommitted?.();
  return saved;
}
