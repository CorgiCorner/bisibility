import type { TrackingPreview } from "./workspace";

export type TrackingScheduleMetadata = {
  name: string;
  cron: string;
  timezone: string;
  enabled: boolean;
  consent: boolean;
};

/**
 * The frozen schedule configuration the app submits after a reviewed preview. Consent follows
 * the requested enabled state; the server action still stamps actor, origin and entry source.
 */
export function buildAiSchedulePayload(
  schedule: TrackingScheduleMetadata,
  preview: TrackingPreview,
  promptIds: readonly string[],
  now: number = Date.now(),
) {
  return {
    ...schedule,
    consent: schedule.enabled && schedule.consent,
    configuration: {
      ...preview,
      promptIds: [...promptIds],
      idempotencyKey: crypto.randomUUID(),
      origin: "manual" as const,
      entrySource: "app" as const,
      deadline: new Date(now + 86_400_000).toISOString(),
    },
  };
}
