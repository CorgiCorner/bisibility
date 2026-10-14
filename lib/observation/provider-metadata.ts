import { objectValue } from "@/lib/rank-measurements/recorded-check";
import type { ObservationScope } from "./types";

/** Parse only documented timestamps with an explicit zone, never the machine's local timezone. */
export function providerObservationTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .trim()
    .replace(/ UTC$/, "+00:00")
    .replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})\s*/, "$1T$2")
    .replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(normalized))
    return null;
  const time = new Date(normalized);
  if (!Number.isFinite(time.getTime())) return null;
  // Date.parse silently normalizes impossible days; reject those without dropping the zone.
  const local = new Date(normalized.replace(/(?:Z|[+-]\d{2}:\d{2})$/, "Z"));
  if (local.toISOString().slice(0, 19) !== normalized.slice(0, 19)) return null;
  return time.toISOString();
}

function nonempty(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function serpApiCapturedMetadata(pages: readonly unknown[]) {
  const observations = pages.map((value) => {
    const page = objectValue(value),
      metadata = objectValue(page?.search_metadata),
      parameters = objectValue(page?.search_parameters);
    const observedAt = providerObservationTime(metadata?.processed_at);
    const location = nonempty(parameters?.location_used),
      language = nonempty(parameters?.hl),
      device = nonempty(parameters?.device);
    return {
      observedAt,
      scope: location && language && device ? { location, language, device } : null,
    };
  });
  const times = observations.map((item) => item.observedAt);
  const scopes = observations.map((item) => item.scope);
  const first = scopes[0] ?? null;
  const effectiveScope: ObservationScope | null =
    first &&
    scopes.every(
      (scope) =>
        scope &&
        scope.location === first.location &&
        scope.language === first.language &&
        scope.device === first.device,
    )
      ? first
      : null;
  // The oldest retrieved page is the conservative freshness anchor for a multi-page observation.
  const validTimes = times.length > 0 && times.every((time) => time !== null);
  return {
    observedAt: validTimes ? [...(times as string[])].sort()[0] : null,
    observedThrough: validTimes ? ([...(times as string[])].sort().at(-1) ?? null) : null,
    effectiveScope,
  };
}

export function dataForSeoCapturedMetadata(results: readonly unknown[]) {
  const times = results.map((result) => providerObservationTime(objectValue(result)?.datetime));
  const valid = times.length > 0 && times.every((time) => time !== null);
  return {
    observedAt: valid ? [...(times as string[])].sort()[0] : null,
    observedThrough: valid ? ([...(times as string[])].sort().at(-1) ?? null) : null,
  };
}
