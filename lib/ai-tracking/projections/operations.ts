import type { TrackingPromptOperations } from "@/lib/ai-tracking/queries/prompt-operations";

export function trackingPromptOperationProjection(operations?: TrackingPromptOperations) {
  const latest = operations?.latestSample;
  const schedules = operations?.upcomingSchedules ?? [];
  const dates = schedules
    .flatMap((schedule) => (schedule.nextRunAt ? [schedule.nextRunAt.toISOString()] : []))
    .sort();
  return {
    sources: [
      ...new Set([
        ...(latest ? [latest.source] : []),
        ...schedules.flatMap((schedule) =>
          schedule.configurations.map((configuration) => configuration.source),
        ),
      ]),
    ],
    lastResult: latest
      ? {
          sampleId: latest.publicId,
          revisionId: latest.promptRevision.publicId,
          text: latest.promptRevision.text,
          measurement: latest.measurement,
          observedAt: latest.evidence.observedAt ?? null,
          recordedAt: latest.createdAt.toISOString(),
        }
      : null,
    nextRunAt: operations?.earliestNextRunAt?.toISOString() ?? dates[0] ?? null,
    nextRunPending: schedules.some((schedule) => !schedule.nextRunAt),
    sourceScopeLimited: operations?.upcomingTruncated ?? false,
  };
}
