import "server-only";
import type { BusinessObservationItem } from "@/lib/business-locations/dto";
import { referenceSchema, timestampSchema } from "@/lib/business-locations/schema";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { BusinessTransaction } from "./context";
import { BusinessLocationUnavailableError, BusinessObservationUnavailableError } from "./errors";
import { retainedWebIdentityIssues } from "./retained-web-identity";

export const retainedBusinessObservationSelect = {
  id: true,
  projectId: true,
  provider: true,
  surface: true,
  engine: true,
  requestPolicy: true,
  rankCheck: { select: { normalizationVersion: true } },
  items: {
    orderBy: { ordinal: "asc" as const },
    select: {
      id: true,
      resultKind: true,
      ordinal: true,
      rankAbsolute: true,
      blockPosition: true,
      positionInBlock: true,
      rankGroup: true,
      rawFragment: true,
      rankScale: true,
      promotion: true,
      sourcePage: true,
      sourceBlockId: true,
      sourceOrdinal: true,
      observedAt: true,
      businessName: true,
      domain: true,
      cid: true,
      placeId: true,
    },
  },
} satisfies Prisma.ObservationRunSelect;
type RetainedObservation = Prisma.ObservationRunGetPayload<{
  select: typeof retainedBusinessObservationSelect;
}>;
export type BusinessObservationSource = Readonly<{
  provider: string;
  adapterVersion: string;
  normalizationVersion: string | null;
  originalObservedAt: string;
  rankScale: string | null;
  sourceBlockId: string | null;
  sourceOrdinal: number | null;
}>;
function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function retainedIdentityIssue(fragment: unknown): Pick<BusinessObservationItem, "identityIssue"> {
  const issues = object(fragment)?.identityIssues;
  if (!Array.isArray(issues) || !issues.length) return {};
  return {
    identityIssue: issues.some((issue) => object(issue)?.reason === "unsafe_numeric_identifier")
      ? "unsafe_numeric_identifier"
      : "invalid_identifier",
  };
}
export function projectRetainedBusinessObservation(run: RetainedObservation) {
  const evidence = object(object(run.requestPolicy)?.evidence);
  if (evidence?.version !== 1 || !referenceSchema.safeParse(evidence.adapterVersion).success)
    throw new BusinessObservationUnavailableError("missing_adapter_version");
  if (!["web_serp", "maps", "local_finder"].includes(run.surface) || run.engine !== "google")
    throw new BusinessObservationUnavailableError("unsupported_surface");
  const provenance = {
    provider: run.provider,
    adapterVersion: referenceSchema.parse(evidence.adapterVersion),
    normalizationVersion:
      run.rankCheck?.normalizationVersion ??
      (run.surface === "maps" ? referenceSchema.parse(evidence.adapterVersion) : null),
  };
  const runTime = timestampSchema.safeParse(evidence.observedAt);
  const webIssues =
    run.surface === "web_serp"
      ? retainedWebIdentityIssues(run.provider, evidence.webLocalPack, run.items)
      : new Map<string, NonNullable<BusinessObservationItem["identityIssue"]>>();
  const sourceByItem = new Map<string, BusinessObservationSource>();
  const items: BusinessObservationItem[] = run.items.map((row) => {
    const observedAt = row.observedAt
      ? runTime.success && Date.parse(runTime.data) === row.observedAt.getTime()
        ? runTime.data
        : row.observedAt.toISOString()
      : runTime.success
        ? runTime.data
        : null;
    if (observedAt === null) throw new BusinessObservationUnavailableError("missing_observed_at");
    sourceByItem.set(row.id, {
      ...provenance,
      originalObservedAt: observedAt,
      rankScale: row.rankScale,
      sourceBlockId: row.sourceBlockId,
      sourceOrdinal: row.sourceOrdinal,
    });
    return {
      projectId: run.projectId,
      observationRunId: run.id,
      itemId: row.id,
      observedAt,
      surface: run.surface as BusinessObservationItem["surface"],
      resultKind: ["local_pack", "map_listing", "listing", "organic_result"].includes(
        row.resultKind,
      )
        ? (row.resultKind as BusinessObservationItem["resultKind"])
        : "unknown",
      promotion:
        row.promotion === "organic" || row.promotion === "promoted" ? row.promotion : "unknown",
      originalOrdinals: {
        page: row.sourcePage,
        block: row.blockPosition,
        slot: row.positionInBlock,
        absolute: row.rankAbsolute,
        ...(run.surface === "maps"
          ? {
              group: row.rankGroup,
              scale: row.rankScale === "maps_organic" ? ("maps_organic" as const) : null,
            }
          : {}),
      },
      ...(run.surface === "maps"
        ? Number(object(run.requestPolicy)?.identityIssueCount ?? 0) > 0
          ? { identityIssue: "invalid_identifier" as const }
          : retainedIdentityIssue(row.rawFragment)
        : webIssues.has(row.id)
          ? { identityIssue: webIssues.get(row.id)! }
          : {}),
      identifiers: [
        ...(row.cid !== null
          ? [
              {
                namespace: "google_business",
                engine: "google",
                type: "cid" as const,
                value: row.cid,
              },
            ]
          : []),
        ...(row.placeId !== null
          ? [
              {
                namespace: "google_business",
                engine: "google",
                type: "place_id" as const,
                value: row.placeId,
              },
            ]
          : []),
      ],
      name: row.businessName,
      domain: row.domain,
    };
  });
  return { sourceByItem, items };
}
export async function loadRetainedBusinessObservation(
  tx: BusinessTransaction,
  projectId: string,
  observationRunId: string,
) {
  const row = await tx.observationRun.findFirst({
    where: { id: observationRunId, projectId },
    select: retainedBusinessObservationSelect,
  });
  if (!row) throw new BusinessLocationUnavailableError();
  return projectRetainedBusinessObservation(row);
}
