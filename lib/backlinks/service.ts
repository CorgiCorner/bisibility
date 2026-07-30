import "server-only";

import { ProviderLookupSignal } from "@/lib/provider-lookups/paid-call";
import { backlinksCachedUntil, backlinksCacheKey, withBacklinksCache } from "./cache";
import { backlinksProject, backlinksSource } from "./context";
import {
  assertBacklinksMaxCost,
  backlinksEstimate,
  fetchBacklinksAnalysis,
  fetchMoreBacklinksRows,
} from "./provider-call";
import {
  appendBacklinksRows,
  findBacklinksSnapshot,
  findBacklinksSnapshotMetadata,
  findCurrentBacklinksSnapshot,
  persistBacklinksSnapshot,
  snapshotEnvelope,
  snapshotMode,
  snapshotProvider,
} from "./snapshot";
import { normalizeBacklinksTarget } from "./target";
import type {
  AnalyzeBacklinksOptions,
  BacklinksOutcome,
  BacklinksServiceContext,
  BacklinksSnapshot,
  BacklinksSummary,
  LoadMoreBacklinkRowsOptions,
} from "./types";

const EMPTY_SUMMARY: BacklinksSummary = {
  backlinksTotal: 0,
  brokenBacklinks: 0,
  brokenPages: 0,
  dofollowPct: 0,
  domainRank: 0,
  lostBacklinks: 0,
  lostReferringDomains: 0,
  newBacklinks: 0,
  newReferringDomains: 0,
  referringDomainsTotal: 0,
  referringPages: 0,
  spamScore: 0,
};

export class BacklinksSnapshotExpiredError extends Error {
  readonly code = "snapshot_expired";

  constructor() {
    super("No unexpired backlinks snapshot exists.");
    this.name = "BacklinksSnapshotExpiredError";
  }
}

function lookupFailure(error: unknown) {
  return error instanceof ProviderLookupSignal ? error.outcome : null;
}

function normalizedInput(options: AnalyzeBacklinksOptions) {
  const normalized = normalizeBacklinksTarget(options.target, options.targetScope);
  return {
    includeSubdomains: normalized.scope === "site" ? (options.includeSubdomains ?? true) : false,
    mode: options.mode ?? ("as_is" as const),
    resultLimit: options.resultLimit ?? 100,
    scope: normalized.scope,
    target: normalized.target,
  };
}

function estimateEnvelope(input: {
  cachedSnapshot: { expiresAt: Date; fetchedAt: Date } | null;
  estimatedCostCents: number;
  includeSubdomains: boolean;
  now: Date;
  provider: string;
  scope: "page" | "site";
  target: string;
}): BacklinksSnapshot {
  const fetchedAt = (input.cachedSnapshot?.fetchedAt ?? input.now).toISOString();
  return {
    cached: input.cachedSnapshot !== null,
    cachedUntil: input.cachedSnapshot?.expiresAt.toISOString() ?? backlinksCachedUntil(fetchedAt),
    costCents: input.cachedSnapshot ? 0 : input.estimatedCostCents,
    estimate: true,
    estimatedCostCents: input.estimatedCostCents,
    fetchedAt,
    fetchedRowCount: 0,
    history: [],
    includeSubdomains: input.includeSubdomains,
    ok: true,
    provider: input.provider,
    rows: [],
    summary: EMPTY_SUMMARY,
    target: input.target,
    targetScope: input.scope,
    totalRowsAvailable: 0,
  };
}

export async function analyzeBacklinks(
  context: BacklinksServiceContext,
  options: AnalyzeBacklinksOptions,
): Promise<BacklinksOutcome> {
  const input = normalizedInput(options);
  const now = new Date();
  const project = await backlinksProject(context.projectId);
  if (!project) return { ok: false, reason: "no_source" };

  let cachedSnapshot: { expiresAt: Date; fetchedAt: Date } | null = null;
  if (!options.fresh) {
    if (options.estimateOnly) {
      cachedSnapshot = await findBacklinksSnapshotMetadata({
        ...input,
        minRows: input.resultLimit,
        now,
        projectId: project.id,
      });
    } else {
      const cached = await findBacklinksSnapshot({
        ...input,
        minRows: input.resultLimit,
        now,
        projectId: project.id,
      });
      if (cached) {
        return snapshotEnvelope(cached, { cached: true, costCents: 0, now });
      }
    }
  }

  const source = backlinksSource(project);
  if (!source) return { ok: false, reason: "no_source" };
  const estimate = backlinksEstimate({
    resultLimit: input.resultLimit,
    scope: input.scope,
    source,
  });
  if (options.estimateOnly) {
    return estimateEnvelope({
      cachedSnapshot,
      estimatedCostCents: estimate.total,
      includeSubdomains: input.includeSubdomains,
      now,
      provider: source.provider.id,
      scope: input.scope,
      target: input.target,
    });
  }

  try {
    assertBacklinksMaxCost(estimate.total, options.maxCostCents);
    const key = backlinksCacheKey({
      includeSubdomains: input.includeSubdomains,
      mode: input.mode,
      projectId: project.id,
      scope: input.scope,
      target: input.target,
    });
    const lookup = await withBacklinksCache({
      fresh: options.fresh,
      key,
      load: async () => {
        const result = await fetchBacklinksAnalysis({
          ...input,
          budgetCapCents: project.budgetCapCents,
          projectId: project.id,
          source,
        });
        const fetchedAt = new Date();
        const persisted = await persistBacklinksSnapshot({
          ...input,
          ...result,
          fetchedAt,
          projectId: project.id,
          provider: source.provider.id,
        });
        return snapshotEnvelope(persisted, {
          cached: false,
          costCents: result.costCents,
          now: fetchedAt,
        });
      },
    });
    if (lookup.status === "contended") {
      return {
        ok: false,
        reason: "in_progress",
        resetAt: lookup.resetAt,
      };
    }
    return lookup.cached ? { ...lookup.value, cached: true, costCents: 0 } : lookup.value;
  } catch (error) {
    return lookupFailure(error) ?? Promise.reject(error);
  }
}

function normalizedLoadMore(options: LoadMoreBacklinkRowsOptions) {
  const normalized = normalizeBacklinksTarget(options.target, options.targetScope);
  return {
    includeSubdomains: normalized.scope === "site" ? options.includeSubdomains : false,
    limit: options.limit,
    scope: normalized.scope,
    target: normalized.target,
  };
}

export async function loadMoreBacklinkRows(
  context: BacklinksServiceContext,
  options: LoadMoreBacklinkRowsOptions,
): Promise<BacklinksOutcome> {
  const input = normalizedLoadMore(options);
  const now = new Date();
  const project = await backlinksProject(context.projectId);
  if (!project) return { ok: false, reason: "no_source" };
  const snapshot = await findCurrentBacklinksSnapshot({
    ...input,
    now,
    projectId: project.id,
  });
  if (!snapshot) throw new BacklinksSnapshotExpiredError();
  const source = backlinksSource(project, snapshotProvider(snapshot.summary));
  if (!source) return { ok: false, reason: "no_source" };

  try {
    const page = await fetchMoreBacklinksRows({
      ...input,
      budgetCapCents: project.budgetCapCents,
      mode: snapshotMode(snapshot.summary),
      offset: snapshot.fetchedRowCount,
      projectId: project.id,
      source,
    });
    const updated = await appendBacklinksRows({
      costCents: page.costCents,
      rows: page.rows,
      snapshot,
    });
    return snapshotEnvelope(
      { ...snapshot, ...updated, rows: [] },
      {
        cached: false,
        costCents: updated.costCents,
        now,
        rows: page.rows,
      },
    );
  } catch (error) {
    return lookupFailure(error) ?? Promise.reject(error);
  }
}
