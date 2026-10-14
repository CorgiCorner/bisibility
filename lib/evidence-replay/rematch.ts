import "server-only";
import { businessReadProjectScope } from "@/lib/business-location-store/access";
import type { BusinessDatabase, BusinessStoreContext } from "@/lib/business-location-store/context";
import { rematchBusinessLocationFor } from "@/lib/business-location-store/match-write";
import { rematchLocationSchema } from "@/lib/business-location-store/schema";
import { businessMatcherVersion, mapsBusinessMatcherVersion } from "@/lib/business-locations/dto";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";
import { EvidenceReplayConflictError } from "./model";
import { retainedRematchSource } from "./rematch-source";

const preparedSchema = z
  .object({
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/u),
    parserVersion: z.enum([businessMatcherVersion, mapsBusinessMatcherVersion]),
    codeHash: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();
/** Read-only preview. Supplied context is an authenticated host context, never a CLI actor. */
export async function prepareRetainedEvidenceRematch(
  input: unknown,
  context: BusinessStoreContext,
  codeHash: string,
  db: BusinessDatabase = prisma,
) {
  const command = rematchLocationSchema.parse(input);
  return db.$transaction(
    async (tx) => {
      const scope = await businessReadProjectScope(tx, context, command.projectId, "entity_match");
      const source = await retainedRematchSource(
        tx,
        scope.project.id,
        command.observationRunId,
        new Date(),
      );
      if (command.expectedDecisions.some((item) => !source.itemIds.includes(item.itemId)))
        throw new EvidenceReplayConflictError();
      return preparedSchema.parse({
        sourceHash: source.sourceHash,
        parserVersion:
          source.surface === "maps" ? mapsBusinessMatcherVersion : businessMatcherVersion,
        codeHash,
      });
    },
    { isolationLevel: "RepeatableRead" },
  );
}
/** Explicit append-only reinterpretation. Original automatic decisions/KPI remain separate. */
export async function replayRetainedEvidenceRematch(
  input: unknown,
  prepared: unknown,
  context: BusinessStoreContext,
  codeHash: string,
  db: BusinessDatabase = prisma,
) {
  const command = rematchLocationSchema.parse(input),
    provenance = preparedSchema.parse(prepared);
  if (provenance.codeHash !== codeHash) throw new EvidenceReplayConflictError();
  return rematchBusinessLocationFor(command, context, db, {
    provenance,
    async assertReplay(tx, scope) {
      const source = await retainedRematchSource(
        tx,
        scope.project.id,
        command.observationRunId,
        new Date(),
      );
      const parserVersion =
        source.surface === "maps" ? mapsBusinessMatcherVersion : businessMatcherVersion;
      if (
        source.sourceHash !== provenance.sourceHash ||
        parserVersion !== provenance.parserVersion ||
        command.expectedDecisions.some((item) => !source.itemIds.includes(item.itemId))
      )
        throw new EvidenceReplayConflictError();
    },
  });
}
