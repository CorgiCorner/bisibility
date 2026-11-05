import "server-only";
import { providerLabel } from "@/lib/checks/attempts";
import type { RetrievedResults, RetrievedRow, StoredResultsTier } from "@/lib/checks/contract";
import { aiOverviewState } from "@/lib/checks/retrieved-results-model";
import {
  organicDomainRanksFromRaw,
  storedOrganicDomainRanks,
} from "@/lib/rank-check/organic-ranks";
import { loadSnapshotExtensionView } from "@/lib/serp/snapshot-extension-view";
import { capturedStopOnMatch } from "./retrieved-results-provenance";

type CheckRow = {
  rankingUrl: string | null;
  publicId: string;
  checkedAt: Date;
  provider: string;
  position: number | null;
  requestedDepth: number | null;
  raw: unknown;
  organicRanks: unknown;
  observationRun?: {
    completeness: string;
    engine?: string;
    surface?: string;
    projectId: string;
    configuredScope?: unknown;
    effectiveScope?: unknown;
    requestPolicy?: unknown;
    items?: {
      resultKind: string;
      title: string | null;
      rawFragment?: unknown;
      [key: string]: unknown;
    }[];
  } | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function computeFullDetailUntil(
  checkedAt: Date,
  retentionDays: number | null,
): string | null {
  if (retentionDays === null) return null;
  return new Date(checkedAt.getTime() + retentionDays * 24 * 60 * 60 * 1000).toISOString();
}

function organicResultsFromRaw(raw: unknown): Record<string, unknown>[] {
  if (!isRecord(raw) || !Array.isArray(raw.organic_results)) return [];
  return raw.organic_results.filter((item): item is Record<string, unknown> => isRecord(item));
}

function maxRankFromRaw(raw: unknown): number | null {
  const results = organicResultsFromRaw(raw);
  let max = 0;
  for (const item of results) {
    const rank = typeof item.rank === "number" ? item.rank : Number(item.rank);
    if (Number.isInteger(rank) && rank > max) max = rank;
  }
  return max || null;
}

function normalizeFeatures(raw: unknown): string[] {
  if (!isRecord(raw) || !Array.isArray(raw.serp_features)) return [];
  return raw.serp_features.filter((f): f is string => typeof f === "string");
}

async function buildFullResult(
  projectId: string,
  check: CheckRow,
  features: string[],
  retrievedPositions: number,
  retentionDays: number | null,
): Promise<RetrievedResults> {
  const results = organicResultsFromRaw(check.raw);
  const rows: RetrievedRow[] = results
    .map((item): RetrievedRow | null => {
      const rank = typeof item.rank === "number" ? item.rank : Number(item.rank);
      if (!Number.isInteger(rank)) return null;
      const domain = typeof item.domain === "string" ? item.domain : "";
      const url = typeof item.url === "string" ? item.url : null;
      const title = typeof item.title === "string" ? item.title : null;
      const resolutions =
        isRecord(check.raw) && Array.isArray(check.raw.redirect_resolutions)
          ? check.raw.redirect_resolutions
          : [];
      const redirect = resolutions.find(
        (value) =>
          url !== null &&
          isRecord(value) &&
          value.status !== "not_redirect" &&
          (value.url === url || value.originalUrl === url),
      );
      return {
        domain,
        resultType: isRecord(redirect)
          ? "redirect"
          : typeof item.type === "string"
            ? item.type
            : "organic",
        resolutionStatus:
          isRecord(redirect) && typeof redirect.status === "string"
            ? redirect.status
            : typeof item.resolutionStatus === "string"
              ? item.resolutionStatus
              : null,
        position: rank,
        title,
        tracked: check.position !== null && rank === check.position,
        url,
      };
    })
    .filter((r): r is RetrievedRow => r !== null);

  const observation = check.observationRun?.projectId === projectId ? check.observationRun : null;
  const overviewItems =
    observation?.items?.filter((item) => item.resultKind === "ai_overview") ?? [];
  const observationItems =
    observation?.items?.map(({ rawFragment: _rawFragment, ...item }) => item) ?? [];
  const policy =
    observation && isRecord(observation.requestPolicy) ? observation.requestPolicy : null;
  const evidence = policy && isRecord(policy.evidence) ? policy.evidence : null;
  return {
    observedAt: evidence && typeof evidence.observedAt === "string" ? evidence.observedAt : null,
    storedData: {
      normalization: isRecord(check.raw) ? (check.raw.normalization ?? null) : null,
      observationItems,
      scope: observation
        ? {
            engine: observation.engine ?? null,
            surface: observation.surface ?? null,
            configured: observation.configuredScope,
            effective: observation.effectiveScope,
            requestPolicy: observation.requestPolicy,
          }
        : null,
    },
    observationCompleteness: observation?.completeness ?? null,
    aiOverviewContentLoaded: overviewItems.length
      ? overviewItems.some((item) => Boolean(item.title))
      : undefined,
    aiOverview: overviewItems.length ? true : aiOverviewState(check.provider, features),
    extension: await loadSnapshotExtensionView({
      projectId,
      checkId: check.publicId,
      provider: check.provider,
      raw: check.raw,
    }),
    rankingUrl: check.rankingUrl ?? null,
    checkId: check.publicId,
    checkedAt: check.checkedAt.toISOString(),
    features,
    fullDetailUntil: computeFullDetailUntil(check.checkedAt, retentionDays),
    provider: check.provider,
    providerLabel: providerLabel(check.provider),
    requestedDepth: check.requestedDepth,
    retrievedPositions,
    rows,
    stoppedAtResult:
      check.observationRun?.projectId === projectId &&
      capturedStopOnMatch(check.observationRun.completeness) === true,
    tier: "full",
    trackedPosition: check.position,
  };
}

function buildCompactResult(check: CheckRow, retentionDays: number | null): RetrievedResults {
  const ranks =
    storedOrganicDomainRanks(check.organicRanks) ?? organicDomainRanksFromRaw(check.raw);
  const domains = (ranks ?? []).map((r) => ({
    bestPosition: r.position,
    domain: r.domain,
  }));
  return {
    rankingUrl: check.rankingUrl ?? null,
    checkId: check.publicId,
    checkedAt: check.checkedAt.toISOString(),
    domains,
    expiredAt: computeFullDetailUntil(check.checkedAt, retentionDays),
    provider: check.provider,
    providerLabel: providerLabel(check.provider),
    tier: "compact",
  };
}

function classifyTier(raw: unknown, organicRanks: unknown): StoredResultsTier {
  if (isRecord(raw) && Array.isArray(raw.organic_results)) return "full";
  if (organicRanks != null || raw != null) return "compact";
  return "none";
}

export function retrievedCheckResult(
  projectId: string,
  check: CheckRow,
  retentionDays: number | null,
): RetrievedResults | Promise<RetrievedResults> {
  const tier = classifyTier(check.raw, check.organicRanks);
  if (tier === "full")
    return buildFullResult(
      projectId,
      check,
      normalizeFeatures(check.raw),
      maxRankFromRaw(check.raw) ?? 0,
      retentionDays,
    );
  if (tier === "compact") return buildCompactResult(check, retentionDays);
  return {
    rankingUrl: check.rankingUrl ?? null,
    checkId: check.publicId,
    checkedAt: check.checkedAt.toISOString(),
    provider: check.provider,
    providerLabel: providerLabel(check.provider),
    tier: "none",
  };
}
