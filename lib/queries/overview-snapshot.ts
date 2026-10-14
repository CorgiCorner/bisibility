import { resolveRecordedChecks } from "@/lib/rank-measurements/check-resolution";
import { semanticRequestedGeo } from "@/lib/rank-measurements/requested-geo";
import type { Keyword } from "./overview-trend";
export const pos = (value: number | null | undefined) =>
  typeof value === "number" && value > 0 && value <= 100 ? value : null;

export function snapshotFor(keyword: Keyword, volume: number | null = null, now = new Date()) {
  const latestAttempt = keyword.rankChecks[0] ?? null;
  const quality = resolveRecordedChecks(
    keyword.rankChecks,
    keyword.publicId,
    {
      ...keyword.measurementPolicy,
      asOf: now,
      requestedGeo: semanticRequestedGeo(keyword.measurementPolicy ?? {}, {
        location: keyword.locationRef.displayName,
        device: keyword.device,
        ...(keyword.locationRef.languageCode ? { language: keyword.locationRef.languageCode } : {}),
      }),
    },
    keyword.projectId,
  );
  const latest = quality.current
    ? (keyword.rankChecks.find(
        (check) =>
          (check.id !== undefined && check.id === quality.current?.measurement.id) ||
          check.checkedAt.getTime() === quality.current?.measurement.recordedAt.getTime(),
      ) ?? null)
    : null;
  const current = pos(quality.current?.position);
  const previous = quality.movement !== null ? pos(quality.baseline?.position) : null;

  return {
    keyword,
    latest,
    latestAttempt,
    movement: current && previous ? previous - current : null,
    position: current,
    previous,
    volume,
    quality,
  };
}

export type Snapshot = ReturnType<typeof snapshotFor>;
