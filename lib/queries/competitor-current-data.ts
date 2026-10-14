import "server-only";
import type { Actor } from "@/lib/auth/authorize";
import { competitorObservation } from "@/lib/competitors/observation-quality";
import type { CompetitorColumn } from "@/lib/competitors/types";
import type { Prisma } from "@/lib/generated/prisma/client";
import { assertDefinitionActor } from "@/lib/measurement-definitions/access";
import { comparablePair, qualifyMeasurement } from "@/lib/rank-measurements/qualify";
import { loadRetainedRankReportTargets } from "@/lib/rank-reports/database";
import { RankReportSnapshotConflictError } from "@/lib/rank-reports/errors";
import { consumerReportOptions } from "./consumer-report-options";
import { loadRankTrackerMetadataBatches } from "./rank-tracker-metadata-batches";
import { loadRankTrackerReportCandidates } from "./rank-tracker-report-database";
import type { RankTrackerReportOptions } from "./rank-tracker-report-model";
import { resolveCurrentRankTrackerTargets } from "./rank-tracker-report-resolve";

export async function loadCompetitorCurrentData(
  tx: Prisma.TransactionClient,
  actor: Actor,
  project: { id: string; publicId: string },
  supplied?: RankTrackerReportOptions,
  capture?: { where: Prisma.KeywordWhereInput; currentNotBefore: Date },
) {
  const options =
    supplied ??
    consumerReportOptions(new Date(), async (current, selected) => {
      if (selected.id !== project.id || selected.publicId !== project.publicId)
        throw new Error("Competitor scope mismatch.");
      await assertDefinitionActor(current, actor.id, project.id, "read");
    });
  // Renew authority even for an empty project; batching would otherwise make no metadata call.
  await options.loadMetadata(tx, project, [], options.asOf);
  const candidates = await loadRankTrackerReportCandidates(
    tx,
    project.id,
    options.limits,
    "include_retained",
    capture ? options.asOf : undefined,
    capture?.where,
  );
  const locations = await tx.location.findMany({
    where: { id: { in: [...new Set(candidates.rows.map((row) => row.locationRef.id))] } },
    select: { id: true, regionCode: true },
  });
  const regionById = new Map(locations.map((row) => [row.id, row.regionCode]));
  const metadata = await loadRankTrackerMetadataBatches(
    options.loadMetadata,
    tx,
    project,
    candidates.rows,
    options.asOf,
  );
  const policy = {
    ...options.policyAt(options.asOf),
    ...(!capture ? { baseline: { mode: "none" as const } } : {}),
    ...(capture ? { currentNotBefore: capture.currentNotBefore } : {}),
    horizon: 10,
    minimumRequestedDepth: 10,
  };
  const targets = await loadRetainedRankReportTargets(
    tx,
    { project, keywords: candidates.rows },
    policy,
    options.limits,
    metadata,
    true,
  );
  const resolved = new Map(
    resolveCurrentRankTrackerTargets(targets, policy, project.id).map((target) => [
      target.id,
      target,
    ]),
  );
  const targetMap = new Map(targets.map((target) => [target.id, target]));
  const suggestionRows = candidates.rows.map((row) => {
    const target = targetMap.get(row.publicId),
      result = resolved.get(row.publicId);
    if (!target || !result) throw new Error("Competitor target resolution missing.");
    const check =
      target.checks.find((item) => item.id === result.resolution.current?.measurement.id) ?? null;
    const domains = [
      ...new Set(
        (check?.observationRun?.items ?? []).flatMap((item) =>
          item.resultKind === "organic_result" && item.domain ? [item.domain] : [],
        ),
      ),
    ];
    const observation = competitorObservation(target, check, policy, project.id, domains, "", {
      keyword: row.text,
      tags: [],
    });
    const ranks = Object.entries(observation.ranks).flatMap(([domain, position]) =>
      position !== null &&
      observation.quality?.[domain]?.evidence === "positive" &&
      observation.quality[domain].freshness !== "stale"
        ? [{ domain, position }]
        : [],
    );
    return { keywordId: row.id, ranks };
  });
  return {
    candidates: candidates.rows.map((row) => ({
      ...row,
      locationRef: { ...row.locationRef, regionCode: regionById.get(row.locationRef.id) ?? null },
    })),
    suggestionRows,
    baselineAsOf: policy.baseline.mode === "before" ? policy.baseline.before : null,
    baselineFor(
      columns: readonly CompetitorColumn[],
      locationId: string,
      device: "desktop" | "mobile",
    ) {
      const comparableIds: string[] = [];
      const rows = candidates.rows
        .filter((row) => row.locationRef.id === locationId && row.device === device)
        .map((row) => {
          const target = targetMap.get(row.publicId),
            result = resolved.get(row.publicId);
          if (!target || !result) throw new Error("Competitor target resolution missing.");
          const window = target.baselineWindow;
          if (
            window &&
            policy.baseline.mode === "before" &&
            window.before.getTime() !== policy.baseline.before.getTime()
          )
            throw new RankReportSnapshotConflictError();
          const before = policy.baseline.mode === "before" ? policy.baseline.before : options.asOf;
          const tolerance = window?.notBefore
            ? window.before.getTime() - window.notBefore.getTime()
            : null;
          const baseline =
            result.resolution.baseline && tolerance !== null
              ? qualifyMeasurement(result.resolution.baseline.measurement, {
                  asOf: before,
                  freshForMs: tolerance,
                  horizon: 10,
                  minimumRequestedDepth: 10,
                  expectedScope: target.expectedScope,
                  requestedGeo: target.requestedGeo,
                  requireCurrentScope: true,
                })
              : null;
          const comparable = capture && comparablePair(result.resolution.current, baseline);
          if (comparable) comparableIds.push(row.publicId);
          const check = comparable
            ? (target.checks.find((item) => item.id === baseline?.measurement.id) ?? null)
            : null;
          return competitorObservation(
            { ...target, freshForMs: tolerance },
            check,
            { ...policy, asOf: before },
            project.id,
            columns.map((column) => column.domain),
            columns[0]?.domain ?? "",
            { keyword: row.text, tags: row.tags.map(({ tag }) => tag.name) },
          );
        });
      return { rows, comparableIds };
    },
    observationsFor(
      columns: readonly CompetitorColumn[],
      locationId: string,
      device: "desktop" | "mobile",
    ) {
      const domains = columns.map(({ domain }) => domain);
      return candidates.rows
        .filter((row) => row.locationRef.id === locationId && row.device === device)
        .map((row) => {
          const target = targetMap.get(row.publicId),
            resolution = resolved.get(row.publicId);
          if (!target || !resolution) throw new Error("Competitor target resolution missing.");
          const check =
            target.checks.find(
              (item) => item.id === resolution.resolution.current?.measurement.id,
            ) ?? null;
          return competitorObservation(
            target,
            check,
            policy,
            project.id,
            domains,
            columns[0]?.domain ?? "",
            {
              keyword: row.text,
              tags: row.tags.map(({ tag }) => tag.name),
            },
          );
        });
    },
  };
}
