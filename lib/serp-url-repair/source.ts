import "server-only";
import { createHash } from "node:crypto";
import {
  type SerpFeaturePresentation,
  serpFeaturePresentation,
} from "@/lib/checks/serp-feature-presentation";
import type { Prisma } from "@/lib/generated/prisma/client";
import { record, type UrlRepairTarget } from "./model";
import { featureUrls } from "./presentation";
export type UrlRepairSource = {
  id: string;
  body: Record<string, unknown>;
  rows: { url: string; rank: number; type: "organic" }[];
  hash: string;
};
export async function loadRepairSource(
  tx: Prisma.TransactionClient,
  projectId: string,
  target: UrlRepairTarget,
): Promise<UrlRepairSource> {
  let id: string | undefined,
    body: Record<string, unknown> | null = null,
    nativeRows: unknown;
  if (target.kind === "check") {
    const [row] = await tx.$queryRaw<
      { id: string; raw: unknown }[]
    >`SELECT check_row.id, check_row.raw FROM rank_checks check_row JOIN keywords keyword_row ON keyword_row.id=check_row."keywordId" WHERE check_row."publicId"=${target.checkId} AND keyword_row."projectId"=${projectId} FOR UPDATE OF check_row`;
    id = row?.id;
    body = record(row?.raw);
    nativeRows = body?.organic_results;
  } else {
    const [row] = await tx.$queryRaw<
      { id: string; result: unknown }[]
    >`SELECT id, result FROM provider_comparison_sides WHERE "projectId"=${projectId} AND "runId"=${target.runId} AND provider=${target.provider} AND status='completed' FOR UPDATE`;
    id = row?.id;
    body = record(row?.result);
    nativeRows = body?.results;
  }
  if (!id || !body || !Array.isArray(nativeRows)) throw new Error("Saved results unavailable.");
  const rows = nativeRows.slice(0, 100).flatMap((value) => {
    const row = record(value);
    return typeof row?.url === "string" &&
      typeof row.rank === "number" &&
      Number.isSafeInteger(row.rank) &&
      row.rank > 0 &&
      row.rank <= 100 &&
      row.url.length <= 4096
      ? [{ url: row.url, rank: row.rank, type: "organic" as const }]
      : [];
  });
  const capture = record(body._capture);
  const raw = target.kind === "check" ? body : record(capture?.raw);
  const native = raw?.provider_response ?? body._providerResponse;
  const observation =
    target.kind === "check"
      ? await tx.observationRun.findFirst({
          where: { projectId, rankCheckId: id },
          select: {
            items: {
              take: 500,
              orderBy: { id: "asc" },
              select: {
                resultKind: true,
                title: true,
                businessName: true,
                positionInBlock: true,
                url: true,
                mapsUrl: true,
                rawFragment: true,
              },
            },
          },
        })
      : null;
  const features =
    target.kind === "comparison" && record(body.features)
      ? (body.features as SerpFeaturePresentation)
      : serpFeaturePresentation(observation?.items ?? [], [], native);
  const allFeatures = native
    ? { ...features, richFeatures: serpFeaturePresentation([], [], native).richFeatures }
    : features;
  const urls = [...new Set([...rows.map((row) => row.url), ...featureUrls(allFeatures)])].slice(
    0,
    500,
  );
  const candidates = urls.map((url, index) => ({ url, rank: index + 1, type: "organic" as const }));
  const hash = createHash("sha256").update(JSON.stringify(candidates)).digest("hex");
  return { id, body, rows: candidates, hash };
}
export async function writeRepairSource(
  tx: Prisma.TransactionClient,
  target: UrlRepairTarget,
  source: UrlRepairSource,
  value: unknown,
) {
  const body = { ...source.body, _urlRepair: value } as Prisma.InputJsonValue;
  if (target.kind === "check")
    await tx.rankCheck.update({ where: { id: source.id }, data: { raw: body } });
  else await tx.providerComparisonSide.update({ where: { id: source.id }, data: { result: body } });
}
