import "server-only";

import { prisma } from "@/lib/db/prisma";
import { isPublicIdOfType } from "@/lib/db/public-id";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  authorizeRankReportScope,
  type RankReportContext,
  type RankReportDatabase,
  snapshotRankReportContext,
} from "./access";
import type { ReportCursorCodec } from "./cursor";
import { loadRetainedRankReportTargets, type RankReportTargetMetadata } from "./database";
import { reportDigest } from "./digest";
import {
  RankReportCapacityError,
  RankReportCursorError,
  RankReportSnapshotConflictError,
} from "./errors";
import {
  type RankReportLimits,
  type RankReportPolicy,
  type RankReportTarget,
  rankReportRequestSchema,
} from "./model";
import { pageRankReportRecords } from "./page";
import { snapshotRankReportPolicy } from "./policy";
import { type RankReportRecord, rankReportRecords } from "./records";
import { rankReportTargetResolution } from "./resolution";
import { resolveRankReportTargets, summarizeRankReport } from "./summary";

export type RankReportReadOptions = {
  cursor: ReportCursorCodec;
  firstAsOf: Date;
  limits: RankReportLimits;
  loadMetadata: (
    tx: Prisma.TransactionClient,
    scope: Awaited<ReturnType<typeof authorizeRankReportScope>>,
    asOf: Date,
  ) => Promise<ReadonlyMap<string, RankReportTargetMetadata>>;
  policyAt: (asOf: Date) => RankReportPolicy;
};

export type RankReportSnapshotProjection = {
  policy: RankReportPolicy;
  project: { id: string; publicId: string };
  sourceDigest: string;
  targets: readonly RankReportTarget[];
};
type SynchronousProjection<T> = (
  snapshot: RankReportSnapshotProjection,
) => T & (T extends PromiseLike<unknown> ? never : unknown);

function validateServerPolicy(
  policy: RankReportPolicy,
  asOf: Date,
  limits: RankReportLimits,
  projectId: string,
) {
  const validDate = (date: Date) => Number.isFinite(date.getTime());
  if (
    !validDate(asOf) ||
    policy.asOf.getTime() !== asOf.getTime() ||
    !Number.isSafeInteger(policy.horizon) ||
    policy.horizon <= 0
  )
    throw new Error("Report server policy is invalid.");
  if (policy.freshForMs !== null && (!Number.isFinite(policy.freshForMs) || policy.freshForMs < 0))
    throw new Error("Report freshness policy is invalid.");
  if (
    policy.minimumRequestedDepth !== null &&
    (!Number.isSafeInteger(policy.minimumRequestedDepth) || policy.minimumRequestedDepth <= 0)
  )
    throw new Error("Report depth policy is invalid.");
  if (
    policy.currentNotBefore &&
    (!validDate(policy.currentNotBefore) || policy.currentNotBefore > asOf)
  )
    throw new Error("Report current boundary is invalid.");
  if (
    policy.baseline.mode === "before" &&
    (!validDate(policy.baseline.before) ||
      policy.baseline.before > asOf ||
      (policy.baseline.notBefore &&
        (!validDate(policy.baseline.notBefore) ||
          policy.baseline.notBefore > policy.baseline.before)))
  )
    throw new Error("Report comparison boundary is invalid.");
  if (Object.values(limits).some((limit) => !Number.isSafeInteger(limit) || limit < 1))
    throw new Error("Report read budgets must be positive integers.");
  if (
    policy.baselineExpectedIds &&
    (policy.baselineProjectId !== projectId ||
      new Set(policy.baselineExpectedIds).size !== policy.baselineExpectedIds.length ||
      policy.baselineExpectedIds.some((id) => !isPublicIdOfType(id, "kw")))
  )
    throw new Error(
      "Baseline membership must have verified project provenance and public target IDs.",
    );
}

/** Auth is renewed on every page. Reads and metadata loading share a repeatable-read database snapshot. */
function prepareRankReportRead(
  context: RankReportContext,
  input: unknown,
  options: RankReportReadOptions,
) {
  const request = rankReportRequestSchema.parse(input);
  const verifiedContext = snapshotRankReportContext(context);
  const codec = options.cursor;
  const limits = {
    maxChecks: options.limits.maxChecks,
    maxItems: options.limits.maxItems,
    maxTargets: options.limits.maxTargets,
  };
  const cursor = request.cursor ? codec.decode(request.cursor) : null;
  const asOf = cursor ? new Date(cursor.asOf) : new Date(options.firstAsOf.getTime());
  const policy = snapshotRankReportPolicy(options.policyAt(new Date(asOf.getTime())));
  validateServerPolicy(policy, asOf, limits, request.projectId);
  if (request.selectedIds.length > limits.maxTargets) throw new RankReportCapacityError();
  const binding = reportDigest({
    actor: verifiedContext.actor.id,
    credential: verifiedContext.credentialId ?? null,
    policy,
    project: request.projectId,
    selected: [...request.selectedIds].sort(),
    resolutionIds: request.resolutionIds ? [...request.resolutionIds].sort() : null,
    stream: request.stream,
    transport: verifiedContext.transport,
    window: request.window,
    recordsQualification: "retained_scope_v1",
  });
  if (cursor && cursor.binding !== binding) throw new RankReportCursorError();
  return { request, verifiedContext, asOf, policy, cursor, codec, binding, limits, options };
}

async function readRankReportInTransaction(
  tx: Prisma.TransactionClient,
  plan: ReturnType<typeof prepareRankReportRead>,
  capture?: (snapshot: RankReportSnapshotProjection) => void,
) {
  const { request, verifiedContext, asOf, policy, cursor, codec, binding, limits, options } = plan;
  const scope = await authorizeRankReportScope(tx, verifiedContext, request, asOf);
  const metadata = new Map<string, RankReportTargetMetadata>(
    [...(await options.loadMetadata(tx, scope, new Date(asOf.getTime())))].map(
      ([id, value]) => [id, structuredClone(value)] as const,
    ),
  );
  const targets = await loadRetainedRankReportTargets(
    tx,
    scope,
    policy,
    limits,
    metadata,
    request.stream === "items",
  );
  const source = reportDigest(targets);
  if (cursor && cursor.source !== source) throw new RankReportSnapshotConflictError();
  // A trusted synchronous projector gets no transaction or mutable shared registry objects.
  capture?.(structuredClone({ policy, project: scope.project, sourceDigest: source, targets }));
  const resolved = resolveRankReportTargets(targets, policy, scope.project.id);
  const summary = summarizeRankReport(resolved, policy);
  const records = rankReportRecords(targets, policy, scope.project.id, "retained_scope");
  const rows: RankReportRecord[] =
    request.stream === "attempts"
      ? records.map(({ attempt }) => attempt)
      : request.stream === "observations"
        ? records.flatMap(({ observation }) => (observation ? [observation] : []))
        : records.flatMap(({ items }) => items);
  const page = pageRankReportRecords(rows, request, cursor?.last ?? null);
  const pageIds = new Set(request.resolutionIds ?? page.records.map(({ keywordId }) => keywordId));
  return {
    asOf: asOf.toISOString(),
    definitionVersion: policy.metric.definitionVersion,
    excludedUnknownTime: page.excludedUnknownTime,
    nextCursor: page.last
      ? codec.encode({ asOf: asOf.toISOString(), binding, last: page.last, source, version: 1 })
      : null,
    projectId: scope.project.publicId,
    records: page.records,
    resolutions: resolved
      .filter(({ id }) => pageIds.has(id))
      .map((target) => rankReportTargetResolution(target, policy)),
    sourceDigest: source,
    stream: request.stream,
    summary,
    totalCount: page.totalCount,
    window: request.window,
  };
}

export async function readRankReportFor(
  context: RankReportContext,
  input: unknown,
  options: RankReportReadOptions,
  db: RankReportDatabase = prisma,
) {
  const plan = prepareRankReportRead(context, input, options);
  return db.$transaction((tx) => readRankReportInTransaction(tx, plan), {
    isolationLevel: "RepeatableRead",
  });
}

function prepareRankReportPages(
  context: RankReportContext,
  inputs: readonly unknown[],
  options: RankReportReadOptions,
) {
  if (inputs.length < 1 || inputs.length > 3) throw new RankReportCapacityError();
  const plans = inputs.map((input) => prepareRankReportRead(context, input, options));
  const snapshotKey = (plan: ReturnType<typeof prepareRankReportRead>) =>
    reportDigest({
      asOf: plan.asOf,
      policy: plan.policy,
      project: plan.request.projectId,
      selected: [...plan.request.selectedIds].sort(),
      from: plan.request.window.from,
      to: plan.request.window.to,
    });
  if (plans.some((plan) => snapshotKey(plan) !== snapshotKey(plans[0])))
    throw new RankReportSnapshotConflictError();
  return plans;
}

/** Observation and attempt initial pages share one actual database snapshot. */
export async function readRankReportPagesFor(
  context: RankReportContext,
  inputs: readonly unknown[],
  options: RankReportReadOptions,
  db: RankReportDatabase = prisma,
) {
  const plans = prepareRankReportPages(context, inputs, options);
  return db.$transaction(
    async (tx) => {
      const pages = [];
      for (const plan of plans) pages.push(await readRankReportInTransaction(tx, plan));
      return pages;
    },
    { isolationLevel: "RepeatableRead" },
  );
}

/** Additive server-only pure projection, bound to the same authorized targets and read snapshot. */
export async function readRankReportPagesWithProjectionFor<T>(
  context: RankReportContext,
  inputs: readonly unknown[],
  options: RankReportReadOptions,
  project: SynchronousProjection<T>,
  db: RankReportDatabase = prisma,
) {
  const plans = prepareRankReportPages(context, inputs, options);
  return db.$transaction(
    async (tx) => {
      const pages = [];
      const captured: { value?: { sourceDigest: string; projection: T } } = {};
      for (const [index, plan] of plans.entries()) {
        const page = await readRankReportInTransaction(
          tx,
          plan,
          index === 0
            ? (snapshot) => {
                const sourceDigest = snapshot.sourceDigest;
                const projection = project(snapshot);
                if (
                  projection !== null &&
                  (typeof projection === "object" || typeof projection === "function") &&
                  "then" in projection &&
                  typeof projection.then === "function"
                )
                  throw new Error("Report projection must be synchronous.");
                captured.value = { sourceDigest, projection };
              }
            : undefined,
        );
        pages.push(page);
      }
      const result = captured.value;
      if (!result || pages.some((page) => page.sourceDigest !== result.sourceDigest))
        throw new RankReportSnapshotConflictError();
      return { pages, projection: result.projection };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
