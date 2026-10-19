import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { ProviderLookupSignal } from "@/lib/provider-lookups/paid-call";
import { claimBacklinksAppend, releaseUnsentBacklinksAppend } from "./append-claim";
import {
  type AppendClaim,
  type AppendPage,
  retainBacklinksPage,
  retainedBacklinksPage,
} from "./append-evidence";
import { invalidateBacklinksCache } from "./cache";
import { backlinksProject, backlinksSource } from "./context";
import { BacklinksSnapshotExpiredError } from "./errors";
import { assertBacklinksMaxCost, backlinksEstimate, fetchMoreBacklinksRows } from "./provider-call";
import {
  appendBacklinksRows,
  findCurrentBacklinksSnapshot,
  snapshotEnvelope,
  snapshotMode,
  snapshotProvider,
} from "./snapshot";
import { openBacklinksSnapshotReference } from "./snapshot-reference";
import { normalizeBacklinksTarget } from "./target";
import type {
  BacklinksEstimate,
  BacklinksRowsOutcome,
  BacklinksServiceContext,
  LoadMoreBacklinkRowsOptions,
} from "./types";

async function finishAppend(
  snapshot: Prisma.BacklinkSnapshotGetPayload<object>,
  claim: AppendClaim,
  page: AppendPage,
  now: Date,
  replay = false,
) {
  const totalRowsAvailable = page.rows.length ? page.totalCount : snapshot.fetchedRowCount;
  const updated = await appendBacklinksRows({
    costCents: page.costCents,
    rows: page.rows,
    snapshot,
    claim,
    totalRowsAvailable,
  });
  await invalidateBacklinksCache({
    projectId: snapshot.projectId,
    provider: snapshotProvider(snapshot.summary),
    mode: snapshotMode(snapshot.summary),
    target: snapshot.target,
    scope: snapshot.targetScope === "page" ? "page" : "site",
    includeSubdomains: snapshot.includeSubdomains,
  });
  return snapshotEnvelope(
    { ...snapshot, ...updated, rows: [] },
    { cached: replay, costCents: replay ? 0 : page.costCents, now, rows: page.rows },
  );
}

export function loadMoreBacklinkRows(
  context: BacklinksServiceContext,
  options: LoadMoreBacklinkRowsOptions & { estimateOnly?: false },
): Promise<Exclude<BacklinksRowsOutcome, BacklinksEstimate>>;
export function loadMoreBacklinkRows(
  context: BacklinksServiceContext,
  options: LoadMoreBacklinkRowsOptions,
): Promise<BacklinksRowsOutcome>;
export async function loadMoreBacklinkRows(
  context: BacklinksServiceContext,
  options: LoadMoreBacklinkRowsOptions,
): Promise<BacklinksRowsOutcome> {
  if (options.provider === "unknown") return { ok: false, reason: "no_source" };
  const normalized = normalizeBacklinksTarget(options.target, options.targetScope);
  const input = {
    includeSubdomains: normalized.scope === "site" ? options.includeSubdomains : false,
    limit: options.limit,
    scope: normalized.scope,
    target: normalized.target,
  };
  const now = new Date();
  const project = await backlinksProject(context.projectId);
  if (!project) return { ok: false, reason: "no_source" };
  const reference = openBacklinksSnapshotReference(options.snapshotRef, project.id);
  if (!reference) throw new BacklinksSnapshotExpiredError();
  const snapshot = await findCurrentBacklinksSnapshot({
    ...input,
    now,
    projectId: project.id,
    provider: options.provider,
    snapshotId: reference.id,
    fetchedRowCount: reference.fetchedRowCount,
  });
  if (
    !snapshot ||
    snapshot.id !== reference.id ||
    snapshot.fetchedRowCount !== reference.fetchedRowCount
  )
    throw new BacklinksSnapshotExpiredError();
  const provider = snapshotProvider(snapshot.summary);
  if (provider === "unknown" || (options.provider && options.provider !== provider))
    return { ok: false, reason: "no_source" };
  const retained = retainedBacklinksPage(snapshot);
  if (retained && !options.estimateOnly)
    return finishAppend(snapshot, retained.claim, retained.page, now, true);
  if (!retained && snapshot.fetchedRowCount >= snapshot.totalRowsAvailable)
    throw new BacklinksSnapshotExpiredError();
  const source = retained ? null : backlinksSource(project, provider);
  if (!source && !retained) return { ok: false, reason: "no_source" };
  const estimatedCostCents =
    source && (options.estimateOnly || options.maxCostCents !== undefined)
      ? backlinksEstimate({ resultLimit: input.limit, scope: input.scope, source }).rows
      : 0;
  if (options.estimateOnly) {
    return {
      ok: true,
      estimate: true,
      cached: Boolean(retained),
      cachedUntil: retained ? snapshot.expiresAt.toISOString() : null,
      costCents: estimatedCostCents,
      estimatedCostCents,
      includeSubdomains: input.includeSubdomains,
      provider,
      target: input.target,
      targetScope: input.scope,
    };
  }
  if (!source) return { ok: false, reason: "no_source" };
  try {
    assertBacklinksMaxCost(estimatedCostCents, options.maxCostCents);
  } catch (error) {
    if (error instanceof ProviderLookupSignal) return error.outcome;
    throw error;
  }
  const claim = await claimBacklinksAppend(snapshot);
  let providerInvoked = false,
    notDispatched = false;
  try {
    const page = await fetchMoreBacklinksRows({
      ...input,
      maxCostCents: options.maxCostCents,
      correlationId: `backlinks-append:${snapshot.id}:${reference.fetchedRowCount}:${claim.token}`,
      onProviderCall: () => {
        providerInvoked = true;
      },
      onNotDispatched: () => {
        notDispatched = true;
      },
      mode: snapshotMode(snapshot.summary),
      origin: context.origin,
      offset: reference.fetchedRowCount,
      projectId: project.id,
      source,
    });
    const retainedClaim = await retainBacklinksPage(snapshot, claim, page);
    return await finishAppend(snapshot, retainedClaim, page, now);
  } catch (error) {
    if (!providerInvoked || notDispatched) await releaseUnsentBacklinksAppend(snapshot, claim);
    if (error instanceof ProviderLookupSignal) return error.outcome;
    throw error;
  }
}
