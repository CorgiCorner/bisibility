import type {
  CostReceipt,
  JsonValue,
  PromptCategory,
  TrackingActorCredential,
  TrackingEntrySource,
} from "@/lib/ai-tracking/contract";
import type {
  SuggestionGenerationConfiguration,
  SuggestionGenerationPreview,
  SuggestionGenerationSnapshot,
} from "@/lib/ai-tracking/suggestions/generation-schema";

export type GenerationState =
  | "planned"
  | "claimed"
  | "submission_started"
  | "submission_unknown"
  | "completed"
  | "failed"
  | "cancelled";
export interface GenerationReceipt extends CostReceipt {
  connectionId: string;
  credentialVersion: string;
  providerRequestId?: string | null;
}
export interface GenerationDraft {
  draftId: string;
  text: string;
  category: PromptCategory;
  provenance: "model_generated_hypothesis";
  evidenceIds: string[];
  popularity: null;
  accepted: false;
}
export interface GenerationResult {
  generationId: string;
  drafts: GenerationDraft[];
  costUsd: string | null;
  costState: "confirmed" | "unknown";
  method: "model_generated_hypothesis";
  limitations: string[];
}
export interface GenerationEvidence {
  inputSnapshot: SuggestionGenerationSnapshot;
  snapshotHash: string;
  requestedModel: string;
  actualModel: string | null;
  providerRequestId: string | null;
  answer: string;
  configuration: SuggestionGenerationConfiguration;
  credentialVersion: string;
  budgetRevision: string;
  consentRevision: string;
  answerTruncated?: boolean;
  raw?: JsonValue | null;
  rawTruncated?: boolean;
}
export interface StartSuggestionGenerationInput {
  idempotencyKey: string;
  requestHash: string;
  preview: SuggestionGenerationPreview;
  actorId: string;
  actorCredential?: TrackingActorCredential;
  entrySource: TrackingEntrySource;
}
export interface RecordGenerationUsageTagInput {
  attemptId: string;
  expectedState: "claimed";
  usageTag: string;
  receipt: GenerationReceipt;
}
export interface ProveGenerationNoDispatchInput {
  attemptId: string;
  expectedState: "planned" | "claimed" | "submission_started";
  reason: string;
  receipt?: GenerationReceipt;
}
export interface PersistSuggestionGenerationInput {
  attemptId: string;
  expectedState: "claimed" | "submission_started" | "submission_unknown";
  state: "completed" | "failed" | "submission_unknown";
  result?: GenerationResult;
  evidence?: GenerationEvidence;
  receipt: GenerationReceipt;
  actualModel?: string | null;
}
