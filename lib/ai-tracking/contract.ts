export const PROMPT_CATEGORIES = ["neutral", "branded", "comparative"] as const;
export type PromptCategory = (typeof PROMPT_CATEGORIES)[number];
export const TRACKING_SOURCES = ["consumer_scrape", "model_api", "google_aio"] as const;
export const TRACKING_ENGINES = ["chat_gpt", "gemini", "claude", "perplexity", "google"] as const;
export const DISPATCH_STATES = [
  "planned",
  "claimed",
  "submission_started",
  "submitted",
  "collecting",
  "submission_unknown",
  "terminal",
] as const;
export const MEASUREMENT_STATES = [
  "answer_present",
  "aio_not_present",
  "partial",
  "unavailable",
  "failed",
  "unknown",
] as const;
export const RUN_STATES = [
  "planned",
  "running",
  "completed",
  "partial",
  "blocked",
  "failed",
  "cancelled",
  "skipped",
] as const;
export type TrackingSource = (typeof TRACKING_SOURCES)[number];
export type TrackingEngine = (typeof TRACKING_ENGINES)[number];
export type DispatchState = (typeof DISPATCH_STATES)[number];
export type MeasurementState = (typeof MEASUREMENT_STATES)[number];
export type RunState = (typeof RUN_STATES)[number];
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
export interface TrackingActorCredential {
  id: string;
  kind: "project_key" | "personal_token" | "oauth_client";
}
export type TrackingOrigin = "manual" | "scheduled";
export type TrackingEntrySource = "app" | "api" | "mcp" | "worker" | "cli" | "sdk";
export interface SourceConfiguration {
  provider: "dataforseo";
  endpoint: string;
  engine: TrackingEngine;
  source: TrackingSource;
  model: string | null;
  parameters: { [key: string]: JsonValue };
}
export interface SamplePlan {
  version: 1;
  projectId: string;
  actorId: string;
  actorCredential?: TrackingActorCredential;
  runId: string;
  sampleId: string;
  promptRevisionId: string;
  promptCategory: PromptCategory;
  promptText: string;
  promptHash: string;
  provider: "dataforseo";
  endpoint: string;
  engine: TrackingEngine;
  source: TrackingSource;
  requestedParameters: { [key: string]: JsonValue };
  requestedModel: string | null;
  requestHash: string;
  credentialConnectionId: string;
  credentialVersion: string;
  budgetRevision: string;
  consentRevision: string;
  origin: TrackingOrigin;
  entrySource: TrackingEntrySource;
  attemptId: string;
  deadline: string;
}
export interface Evidence {
  answerText: string | null;
  raw: JsonValue | null;
  answerTruncated: boolean;
  rawTruncated: boolean;
  searchResults: CitationInput[];
  requestedLocale: string | null;
  effectiveLocale: string | null;
  localeMechanism: string | null;
  requestedModel: string | null;
  actualModel: string | null;
  providerStatus: string | null;
  observedAt: string;
  fetchedAt: string;
  recordedSource: "fresh" | "cache";
}
export interface CostReceipt {
  providerCostEntryId: string | null;
  amountUsd: string | null;
  state: "unknown" | "pending" | "confirmed" | "refund_pending" | "derived";
}
export interface CitationInput {
  url: string;
  title: string | null;
  position: number;
}
export interface EntityObservationInput {
  entityKey: string;
  name: string;
  competitorId: string | null;
  mentioned: boolean;
  snippet?: string | null;
  matchPolicy?: string;
  confidence?: number | null;
  aliases?: string[];
  position: number | null;
}
export interface TrackingLimits {
  activePrompts: number;
  topics: number;
}
export const DEFAULT_TRACKING_LIMITS: TrackingLimits = { activePrompts: 100, topics: 30 };
export interface PlanTrackingRunInput {
  actorId: string;
  actorCredential?: TrackingActorCredential;
  idempotencyKey: string;
  promptIds: string[];
  configurations: SourceConfiguration[];
  credentialConnectionId: string;
  credentialVersion: string;
  budgetRevision: string;
  consentRevision: string;
  origin: TrackingOrigin;
  entrySource: TrackingEntrySource;
  deadline: string;
  scheduleId?: string;
  plannedAt?: string;
  retryOfRunId?: string;
}
export interface PersistTrackingResultInput {
  attemptId: string;
  expectedDispatch: DispatchState;
  measurement: MeasurementState;
  evidence: Evidence;
  citations: CitationInput[];
  observations: EntityObservationInput[];
  receipt: CostReceipt;
}
export interface TrackingPageInput {
  cursor?: string;
  limit?: number;
}
export interface TrackingPage<T> {
  items: T[];
  nextCursor: string | null;
}
