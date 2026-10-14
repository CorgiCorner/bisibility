import { measurementHelpRegistry } from "./registry";
import type { HelpContext, HelpCount, ResolvedHelp } from "./types";

function countsOnly(input: unknown, allowed: readonly HelpCount[]): HelpContext {
  if (!input || typeof input !== "object" || Array.isArray(input)) return Object.freeze({});
  const counts = (input as { counts?: unknown }).counts;
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) return Object.freeze({});
  const safe: Partial<Record<HelpCount, number | null>> = {};
  for (const field of allowed) {
    if (!Object.hasOwn(counts, field)) continue;
    const value = (counts as Record<string, unknown>)[field];
    // A malformed counter remains unknown. Missing counters remain missing.
    safe[field] =
      typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  return Object.freeze(safe);
}

/** Does not compute metrics, coverage, freshness, or claim improvement. */
export function resolveMeasurementHelp(
  metricId: unknown,
  definitionVersion: unknown,
  report?: unknown,
): ResolvedHelp {
  if (typeof metricId !== "string") return { status: "invalid_id" };
  const known = measurementHelpRegistry.find((item) => item.metricId === metricId);
  if (!known) return { status: "invalid_id" };
  if (
    typeof definitionVersion !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(definitionVersion)
  ) {
    return { status: "invalid_version" };
  }
  const exact = measurementHelpRegistry.find(
    (item) => item.metricId === metricId && item.definitionVersion === definitionVersion,
  );
  if (!exact) {
    // Only the stable title and fixed anchor are used from the known entry.
    // Version-dependent definitions and context MUST NOT fall back to it.
    return Object.freeze({
      status: "unsupported_version",
      entry: Object.freeze({
        metricId: known.metricId,
        kind: known.kind,
        titleKey: known.titleKey,
        glossaryAnchor: known.glossaryAnchor,
      }),
      requestedVersion: definitionVersion,
      context: Object.freeze({}),
    });
  }
  return Object.freeze({
    status: "supported",
    entry: exact,
    requestedVersion: definitionVersion,
    context: countsOnly(report, exact.contextFields),
  });
}
