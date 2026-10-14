import {
  type AuditFieldPolicy,
  type AuditPayloadPolicy,
  auditFields as f,
} from "./audit-payload-policy";

const impact = {
  ...f.numbers("existingTargetRetargets", "newTargets", "inheritedDepthTargets"),
  ...f.strings("recurringEstimate"),
};
export const reviewedConsentPolicy: AuditFieldPolicy = {
  ...f.booleans("confirmed"),
  ...f.numbers("reviewedTargetCount"),
  ...f.strings(
    "version",
    "basis",
    "purpose",
    "principalKind",
    "outcome",
    "quoteDigest",
    "quoteSourceDigest",
    "selectionDigest",
    "sourceDigest",
    "policyRevision",
  ),
  ...f.dates("expiresAt"),
  impact,
  calendar: {
    ...f.dates("windowStart", "windowEnd", "nextRunAt"),
    ...f.numbers(
      "dueOccurrences",
      "targetCount",
      "keywordCount",
      "locationCount",
      "languageCount",
      "deviceCount",
    ),
  },
  nativeEstimates: [
    { ...f.strings("providerId", "unit", "quantity", "certainty"), ...f.numbers("unknownTargets") },
  ],
};
export const withReviewedConsent = (policy: AuditFieldPolicy) => ({
  ...(policy as Record<string, AuditFieldPolicy>),
  consent: reviewedConsentPolicy,
});

export function registerReviewedFrequencyAudit(
  declare: (actions: readonly string[], policy?: AuditPayloadPolicy) => void,
  policy: AuditFieldPolicy,
) {
  declare(["settings.rank_check_frequency.update"], {
    before: policy,
    after: withReviewedConsent(policy),
  });
}
