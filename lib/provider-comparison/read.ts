import { redactProviderResponse } from "./provider-response";
import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { assertComparisonAccess } from "./access";
import { comparisonDepth, comparisonKeyword, parseComparisonSnapshot, requestUuid } from "./model";
import { publicComparisonResult, type RetainedComparisonResult } from "./retained-result";
import type { ComparisonRun, ComparisonSideStatus } from "./types";
export function comparisonRunView(
  row: Prisma.ProviderComparisonRunGetPayload<{ include: { sides: true } }>,
): ComparisonRun {
  const snapshot = parseComparisonSnapshot(row.snapshot);
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    keyword: comparisonKeyword(snapshot),
    ...(snapshot.locationKey
      ? {
          search: {
            locationKey: snapshot.locationKey,
            locationKind: snapshot.locationKind ?? "country",
            countryCode: snapshot.location.gl.toUpperCase(),
            language: snapshot.location.hl,
          },
        }
      : {}),
    depth: snapshot.depth ?? comparisonDepth,
    sides: snapshot.connections.map((connection) => {
      const side = row.sides.find((item) => item.provider === connection.provider);
      if (!side) throw new Error("Comparison side is unavailable.");
      return {
        provider: connection.provider,
        status: side.status as ComparisonSideStatus,
        costCents: side.costCents === null ? null : Number(side.costCents),
        customerCostCents: side.customerCostCents == null ? null : Number(side.customerCostCents),
        fundingSource: connection.fundingSource,
        quantity: side.quantity === null ? null : Number(side.quantity),
        reason: side.reason,
        result: publicComparisonResult(side.result),
        canSave: Boolean(
          (side.result as RetainedComparisonResult | null)?._capture ||
            (side.result as RetainedComparisonResult | null)?._sourceCheckId,
        ),
        savedCheckRef: (side.result as RetainedComparisonResult | null)?._savedCheckRef ?? null,
      };
    }),
  };
}
export async function readProviderComparison(input: {
  projectId: string;
  actorId: string;
  runId: string;
}): Promise<ComparisonRun | null> {
  requestUuid.parse(input.runId);
  return prisma.$transaction(async (tx) => {
    await assertComparisonAccess(tx, input.projectId, input.actorId, false);
    const row = await tx.providerComparisonRun.findFirst({
      where: { id: input.runId, projectId: input.projectId },
      include: { sides: true },
    });
    return row ? comparisonRunView(row) : null;
  });
}
export async function readLatestProviderComparison(input: {
  projectId: string;
  keywordId: string;
  actorId: string;
}): Promise<ComparisonRun | null> {
  return prisma.$transaction(async (tx) => {
    await assertComparisonAccess(tx, input.projectId, input.actorId, false);
    const row = await tx.providerComparisonRun.findFirst({
      where: { projectId: input.projectId, keywordId: input.keywordId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { sides: true },
    });
    return row ? comparisonRunView(row) : null;
  });
}

export async function readPlaygroundRaw(input: {
  projectId: string;
  actorId: string;
  runId: string;
  provider: import("./types").ComparisonProvider;
}) {
  requestUuid.parse(input.runId);
  return prisma.$transaction(async (tx) => {
    await assertComparisonAccess(tx, input.projectId, input.actorId, false);
    const side = await tx.providerComparisonSide.findFirst({
      where: {
        projectId: input.projectId,
        provider: input.provider,
        run: { id: input.runId, projectId: input.projectId, keywordId: null },
      },
    });
    if (!side) throw new Error("Comparison result unavailable.");
    const retained = side.result as RetainedComparisonResult | null;
    const response = retained?._capture?.raw?.provider_response ?? retained?._providerResponse;
    return response === undefined ? null : redactProviderResponse(response);
  });
}
