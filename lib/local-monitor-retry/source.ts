import { localDigest } from "@/lib/local-monitoring-store/canonical";
export function monitorRetrySource(input: {
  occurrence: { actorId: string | null; [key: string]: unknown };
  revisionHash: string;
  runId: string;
  publicRunId: string;
  expectedTargetKeys: readonly string[];
  members: readonly { itemId: string; targetId: string; targetKey: string }[];
}) {
  const { actorId: _formerActor, ...immutableOccurrence } = input.occurrence;
  return localDigest([
    "local-monitor-retry-source-v1",
    immutableOccurrence,
    input.revisionHash,
    input.runId,
    input.publicRunId,
    [...input.expectedTargetKeys].sort(),
    [...input.members].sort((a, b) =>
      a.targetId < b.targetId ? -1 : a.targetId > b.targetId ? 1 : 0,
    ),
  ]);
}
