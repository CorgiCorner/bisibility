import type { Prisma } from "@/lib/generated/prisma/client";
import type {
  RankTrackerReportMetadata,
  RankTrackerReportOptions,
} from "./rank-tracker-report-model";

/** The authority reader bounds each query; every selected target still participates. */
export async function loadRankTrackerMetadataBatches(
  load: RankTrackerReportOptions["loadMetadata"],
  tx: Prisma.TransactionClient,
  project: { id: string; publicId: string },
  targets: readonly { id: string; publicId: string }[],
  asOf: Date,
) {
  const result = new Map<string, RankTrackerReportMetadata>();
  for (let start = 0; start < targets.length; start += 500) {
    const batch = targets.slice(start, start + 500).map((target) => ({ ...target }));
    const allowed = new Set(batch.map(({ publicId }) => publicId));
    const values = await load(tx, { ...project }, batch, new Date(asOf.getTime()));
    for (const [id, value] of values) {
      if (!allowed.has(id) || result.has(id))
        throw new Error("Report metadata does not match its authorized target batch.");
      result.set(id, structuredClone(value));
    }
  }
  return result;
}
