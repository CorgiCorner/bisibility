import "server-only";
import type { Actor } from "@/lib/auth/authorize";
import type { Prisma } from "@/lib/generated/prisma/client";
import { assertDefinitionActor } from "@/lib/measurement-definitions/access";
import { loadRetainedRankReportTargets } from "@/lib/rank-reports/database";
import { RankReportCapacityError } from "@/lib/rank-reports/errors";
import { consumerReportOptions } from "./consumer-report-options";
import { loadRankTrackerMetadataBatches } from "./rank-tracker-metadata-batches";
import type { RankTrackerReportOptions } from "./rank-tracker-report-model";
import { resolveCurrentRankTrackerTargets } from "./rank-tracker-report-resolve";

/** Legacy consumers keep their formula/cohort; evidence comes from the retained report authority. */
export async function readLegacyOverviewQuality(
  tx: Prisma.TransactionClient,
  scope: { actor: Actor; project: { id: string; publicId: string } },
  candidates: readonly { id: string; publicId: string; createdAt: Date }[],
  input: {
    now: Date;
    horizon: number;
    currentNotBefore?: Date;
    includeItems?: boolean;
    report?: RankTrackerReportOptions;
  },
) {
  const { project, actor } = scope;
  const options =
    input.report ??
    consumerReportOptions(input.now, async (current, selected) => {
      if (selected.id !== project.id || selected.publicId !== project.publicId)
        throw new Error("Legacy overview project scope changed.");
      await assertDefinitionActor(current, actor.id, project.id, "read");
    });
  if (options.asOf.getTime() !== input.now.getTime())
    throw new Error("Legacy overview snapshot changed.");
  // Renew permission for empty cohorts too; batching alone has no metadata call in that case.
  await options.loadMetadata(tx, project, [], input.now);
  const keywords = candidates.filter((row) => row.createdAt <= input.now);
  if (keywords.length > options.limits.maxTargets) throw new RankReportCapacityError();
  const metadata = await loadRankTrackerMetadataBatches(
    options.loadMetadata,
    tx,
    project,
    keywords,
    input.now,
  );
  const policy = {
    ...options.policyAt(input.now),
    baseline: { mode: "none" as const },
    horizon: input.horizon,
    minimumRequestedDepth: input.horizon,
    currentNotBefore: input.currentNotBefore ?? null,
  };
  const targets = await loadRetainedRankReportTargets(
    tx,
    { project, keywords },
    policy,
    options.limits,
    metadata,
    input.includeItems ?? false,
  );
  return {
    targets,
    policy,
    resolutions: resolveCurrentRankTrackerTargets(targets, policy, project.id),
  };
}
