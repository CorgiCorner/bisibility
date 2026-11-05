import type {
  CapabilityScope,
  RecoveryAdmissionReason,
} from "@/lib/providers/account-health/types";

export type QueuedRefusalProof = {
  batchId: string;
  connectionId: string;
  credentialVersion: string | null;
  incidentId: string | null;
  legacyVersion: number | null;
  rankCheckIds: string[];
  reason: RecoveryAdmissionReason;
  scope: CapabilityScope;
};

export type QueuedSubmissionResult = {
  state: string;
  refusal?: QueuedRefusalProof;
  /** Correlation ids left unknown so a later activity can settle them without a task post. */
  deferredUsage?: readonly string[];
};
