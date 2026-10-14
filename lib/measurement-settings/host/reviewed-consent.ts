import "server-only";
import { settingsHash } from "./hash";
import { type SettingsQuoteBinding, verifySettingsQuote } from "./quote-binding";

type Purpose = "defaults" | "intent" | "schedule" | "manual";
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const count = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
const hash = (value: unknown) =>
  typeof value === "string" && /^[a-f0-9]{64}$/u.test(value) ? value : null;
function epoch(value: unknown) {
  if (typeof value === "string" && /^(0|[1-9]\d*)$/u.test(value)) return value;
  if (typeof value === "bigint" && value >= 0n) return value.toString();
  return count(value)?.toString() ?? null;
}
const date = (value: unknown) =>
  typeof value === "string" &&
  /^\d{4}-\d\d-\d\dT.*Z$/u.test(value) &&
  Number.isFinite(Date.parse(value))
    ? value
    : null;
const label = (value: unknown) =>
  typeof value === "string" && /^[a-z][a-z0-9_-]{0,63}$/u.test(value) ? value : null;
function impact(value: unknown) {
  const row = object(value);
  return row
    ? Object.freeze({
        existingTargetRetargets: count(row.existingTargetRetargets),
        newTargets: count(row.newTargets),
        inheritedDepthTargets: count(row.inheritedDepthTargets),
        recurringEstimate:
          row.recurringEstimate === "unchanged" || row.recurringEstimate === "unknown"
            ? row.recurringEstimate
            : null,
      })
    : null;
}
function calendar(value: unknown) {
  const row = object(value);
  if (!row) return null;
  const scope = object(row.targetScope);
  return Object.freeze({
    windowStart: date(row.windowStart),
    windowEnd: date(row.windowEnd),
    nextRunAt: date(row.nextRunAt),
    dueOccurrences: count(row.dueOccurrences),
    targetCount: count(scope?.targetCount),
    keywordCount: count(scope?.keywordCount),
    locationCount: count(scope?.locationCount),
    languageCount: count(scope?.languageCount),
    deviceCount: count(scope?.deviceCount),
  });
}
function estimates(value: unknown) {
  if (!Array.isArray(value)) return null;
  return Object.freeze(
    value.map((value) => {
      const row = object(value);
      return Object.freeze({
        providerId: label(row?.providerId),
        unit: label(row?.unit),
        quantity:
          typeof row?.quantity === "string" &&
          /^\d+(?:\.\d+)?$/u.test(row.quantity) &&
          row.quantity.length <= 128
            ? row.quantity
            : null,
        unknownTargets: count(row?.unknownTargets),
        certainty:
          row?.certainty === "estimate" ||
          row?.certainty === "partial" ||
          row?.certainty === "unknown"
            ? row.certainty
            : null,
      });
    }),
  );
}
/** Audit metadata only; MAC verification precedes whitelist copying, never substitutes for admission. */
function manualTargetCount(value: unknown) {
  return Array.isArray(value) && value.every((row) => typeof row === "string" && row.length > 0)
    ? count(value.length)
    : null;
}
function manualEstimates(value: unknown) {
  return Array.isArray(value) && value.length ? estimates(value) : null;
}
function projectVerifiedConsent(
  purpose: Purpose,
  token: string,
  binding: SettingsQuoteBinding,
  now: Date,
  principalKind: "user" | "project_key" = "user",
) {
  const verified = verifySettingsQuote(purpose, token, binding, now);
  const source = object(binding.source);
  const forecast = purpose === "schedule" ? object(source?.forecast) : null;
  const projectedCalendar = calendar(forecast?.calendar);
  return Object.freeze({
    version: "reviewed-consent-v1" as const,
    confirmed: true as const,
    basis: "verified_quote" as const,
    purpose,
    principalKind,
    outcome: purpose === "manual" ? ("measurement_queued" as const) : ("settings_saved" as const),
    quoteDigest: settingsHash("audit-reviewed-quote", token),
    quoteSourceDigest: verified.sourceHash ?? null,
    selectionDigest: verified.selectionHash,
    sourceDigest: hash(source?.sourceHash),
    policyRevision: epoch(source?.policyEpoch),
    expiresAt: new Date(verified.exp * 1000).toISOString(),
    impact: impact(
      purpose === "defaults" ? source?.impact : purpose === "intent" ? source?.intentEffect : null,
    ),
    calendar: projectedCalendar,
    // No forecast is unknown, not a known zero-cost or zero-occurrence forecast.
    nativeEstimates:
      purpose === "manual"
        ? manualEstimates(object(source?.manual)?.estimates)
        : projectedCalendar
          ? estimates(object(forecast?.calendar)?.recurringEstimates)
          : null,
    ...(purpose === "manual"
      ? { reviewedTargetCount: manualTargetCount(object(source?.manual)?.targetIds) }
      : {}),
  });
}
export function verifiedReviewedConsent(
  purpose: Exclude<Purpose, "manual">,
  token: string,
  binding: SettingsQuoteBinding,
  now: Date,
  principalKind: "user" | "project_key" = "user",
) {
  return projectVerifiedConsent(purpose, token, binding, now, principalKind);
}
export type ReviewedConsentSummary = ReturnType<typeof verifiedReviewedConsent>;
const manualConsents = new WeakMap<object, Readonly<{ projectId: string; actorId: string }>>();
export function verifiedManualConsent(token: string, binding: SettingsQuoteBinding, now: Date) {
  const summary = Object.freeze({
    ...projectVerifiedConsent("manual", token, binding, now),
    purpose: "manual" as const,
    outcome: "measurement_queued" as const,
  });
  manualConsents.set(summary, { projectId: binding.projectId, actorId: binding.actorId });
  return summary;
}
export type VerifiedManualConsent = ReturnType<typeof verifiedManualConsent>;
/** This server-only evidence is consumed once in the canonical run/audit transaction. */
export function consumeManualConsent(
  summary: VerifiedManualConsent,
  projectId: string,
  actorId: string | null,
) {
  const binding = manualConsents.get(summary);
  if (!binding || binding.projectId !== projectId || binding.actorId !== actorId)
    throw new Error("verified_manual_consent_required");
  manualConsents.delete(summary);
  return summary;
}
