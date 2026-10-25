import { evidenceRunsPath } from "@/lib/checks/evidence-runs-query";
import type { EvidenceProjection } from "@/lib/provider-evidence/projection/model";
import { projectRunRankCheckPath } from "@/lib/routing/project-runs-path";
import { z } from "zod";

export const storedSummaryPayloadSchema = z.object({
  kind: z.enum(["manual", "scheduled"]),
  windowStart: z.iso.datetime(),
  windowEnd: z.iso.datetime(),
  runPublicId: z.string().nullable(),
  entries: z.array(
    z.object({
      checkId: z.string(),
      keywordPublicId: z.string(),
      group: z.enum(["down", "up", "failed", "under_review", "unchanged", "new"]),
      previous: z.number().nullable(),
      current: z.number().nullable(),
      deferredReason: z.string().nullable().optional(),
    }),
  ),
  linkedIncidentIds: z.array(z.string()),
  linkTarget: z.union([
    z.object({ run: z.string() }),
    z.object({ from: z.iso.datetime(), to: z.iso.datetime(), trigger: z.literal("scheduled") }),
  ]),
});
export type SummaryDetails = {
  version: number;
  withdrawn: boolean;
  kind: "manual" | "scheduled";
  windowStart: string;
  windowEnd: string;
  runPublicId: string | null;
  topN: number;
  positionMove: number;
  runsHref: string;
  incidentHrefs: string[];
  rows: Array<
    z.infer<typeof storedSummaryPayloadSchema>["entries"][number] & {
      keyword: string | null;
      market: string | null;
      available: boolean;
      projection: EvidenceProjection | null;
    }
  >;
};
export function summaryRunsHref(
  projectRef: string,
  target: z.infer<typeof storedSummaryPayloadSchema>["linkTarget"],
) {
  return "run" in target
    ? projectRunRankCheckPath(projectRef, target.run)
    : evidenceRunsPath(projectRef, target);
}
/** Replays the stored IDs, order, classifications and positions, never fresh aggregation. */
export function summaryDetailsModel(input: {
  payload: unknown;
  version: number;
  notificationVersion: number;
  withdrawn: boolean;
  checkIds: string[];
  topN: number;
  positionMove: number;
  projectRef: string;
  checks: ReadonlyMap<string, { keyword: string; market: string }>;
  evidence: ReadonlyMap<string, EvidenceProjection | null>;
}): SummaryDetails | null {
  const parsed = storedSummaryPayloadSchema.safeParse(input.payload);
  if (!parsed.success || input.version !== input.notificationVersion) return null;
  const payload = parsed.data;
  const entries = new Map(payload.entries.map((entry) => [entry.checkId, entry]));
  if (entries.size !== input.checkIds.length || input.checkIds.some((id) => !entries.has(id)))
    return null;
  return {
    version: input.version,
    withdrawn: input.withdrawn,
    kind: payload.kind,
    windowStart: payload.windowStart,
    windowEnd: payload.windowEnd,
    runPublicId: payload.runPublicId,
    topN: input.topN,
    positionMove: input.positionMove,
    runsHref: summaryRunsHref(input.projectRef, payload.linkTarget),
    incidentHrefs: payload.linkedIncidentIds.map(
      (incidentId) =>
        `${evidenceRunsPath(input.projectRef)}&incidentId=${encodeURIComponent(incidentId)}`,
    ),
    rows: input.checkIds.map((id) => ({
      ...entries.get(id)!,
      available: input.checks.has(id),
      keyword: input.checks.get(id)?.keyword ?? null,
      market: input.checks.get(id)?.market ?? null,
      projection: input.evidence.get(id) ?? null,
    })),
  };
}
