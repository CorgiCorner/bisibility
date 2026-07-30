import { parsePublicId } from "@/lib/db/public-id";

export type MigrationImportCompletion = {
  counts: Record<string, number>;
  jobId: string;
  state: "done";
};

export function migrationCompletionFromResponse(body: unknown): MigrationImportCompletion {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Destination returned an invalid import result.");
  }
  const result = body as Record<string, unknown>;
  if (
    result.state !== "done" ||
    typeof result.job_id !== "string" ||
    parsePublicId(result.job_id)?.prefix !== "imp"
  ) {
    throw new Error("Destination did not confirm a completed import.");
  }
  const rawCounts =
    result.counts && typeof result.counts === "object" && !Array.isArray(result.counts)
      ? (result.counts as Record<string, unknown>)
      : {};
  const counts = Object.fromEntries(
    Object.entries(rawCounts).filter((entry): entry is [string, number] =>
      Number.isFinite(entry[1]),
    ),
  );
  return { counts, jobId: result.job_id, state: "done" };
}
