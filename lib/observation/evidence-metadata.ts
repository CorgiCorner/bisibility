import type { ObservationRequestPolicy, ObservationResultKind } from "./types";

export type ObservationEvidenceMetadata = {
  version: 1;
  adapterVersion: string;
  observedAt: string | null;
  observedThrough?: string | null;
  requestedAt: string | null;
  targetRevision?: string | null;
  policyRevision?: string | null;
  webLocalPack?: {
    version: 1;
    identityIssues: number;
    scopeSource: "sent_request" | "provider_echo" | null;
    completeness: "unknown";
  };
  completeThrough: Partial<Record<ObservationResultKind, number | null>>;
};

/** A requested depth or item count is not proof of any complete result prefix. */
export function observationEvidencePolicy(
  policy: ObservationRequestPolicy,
  adapterVersion: string,
): ObservationRequestPolicy & { evidence: ObservationEvidenceMetadata } {
  return {
    ...policy,
    evidence: policy.evidence ?? {
      version: 1,
      adapterVersion,
      observedAt: null,
      requestedAt: null,
      completeThrough: { organic_result: null, local_pack: null, ai_overview: null },
    },
  };
}
