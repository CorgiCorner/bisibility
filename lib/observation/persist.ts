import "server-only";

import { Prisma } from "@/lib/generated/prisma/client";
import { observationDefinitionForCheck } from "./persist-definition";
import { persistObservationItems } from "./persist-items";
import type { ObservationRunInput, WebObservationRunInput } from "./types";

export async function persistObservationRun(
  tx: Prisma.TransactionClient,
  params: {
    rankCheckId: string;
    projectId: string;
    input: WebObservationRunInput;
    definitionBindingId?: string | null;
  },
): Promise<void> {
  const captured = await observationDefinitionForCheck(
    tx,
    params.projectId,
    params.rankCheckId,
    params.input,
    params.definitionBindingId,
  );
  const input = captured.input;
  const observationRun = await tx.observationRun.create({
    data: {
      rankCheckId: params.rankCheckId,
      definitionBindingId: captured.definitionBindingId,
      projectId: params.projectId,
      provider: input.provider,
      surface: input.surface,
      engine: input.engine,
      requestPolicy: input.requestPolicy as Prisma.InputJsonValue,
      completeness: input.completeness,
      configuredScope: input.configuredScope as Prisma.InputJsonValue,
      effectiveScope: input.effectiveScope ?? Prisma.DbNull,
      executedAt: input.executedAt,
    },
  });

  await persistObservationItems(tx, observationRun.id, input.items, true);
}

export async function persistRankCheckObservation(
  tx: Prisma.TransactionClient,
  input: ObservationRunInput | null | undefined,
  projectId: string,
  rankCheckId: string,
  definitionBindingId?: string | null,
): Promise<void> {
  if (!input) return;
  if (input.surface !== "web_serp")
    throw new Error("Local observations require a neutral execution owner.");
  await persistObservationRun(tx, { input, projectId, rankCheckId, definitionBindingId });
}
