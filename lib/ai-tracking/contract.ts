import type { AcceptedActionPayment } from "@/lib/action-payment/contract";
import type { AiPaymentConsent } from "@/lib/ai-research/payment";
import type { MeterOperationReference } from "@/lib/metering/operation-reference";
import type { z } from "zod";
import type * as schema from "./schema";
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
export interface SourceConfiguration extends z.output<typeof schema.sourceConfigurationSchema> {}
export interface SamplePlan {
  paymentConsent?: AiPaymentConsent;
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
export interface Evidence
  extends z.input<typeof schema.persistTrackingResultSchema.shape.evidence> {
  searchResults: CitationInput[];
}
export interface CostReceipt
  extends z.input<typeof schema.persistTrackingResultSchema.shape.receipt> {
  operationRef?: MeterOperationReference | null;
}
export interface CitationInput
  extends z.input<typeof schema.persistTrackingResultSchema.shape.citations.element> {}
export interface EntityObservationInput
  extends z.input<typeof schema.persistTrackingResultSchema.shape.observations.element> {}
export interface TrackingLimits {
  activePrompts: number;
  topics: number;
}
export const DEFAULT_TRACKING_LIMITS: TrackingLimits = { activePrompts: 100, topics: 30 };
export interface PlanTrackingRunInput extends z.input<typeof schema.planTrackingRunSchema> {
  paymentConsent?: AiPaymentConsent;
  acceptedPayment?: AcceptedActionPayment;
  actorCredential?: TrackingActorCredential;
  configurations: SourceConfiguration[];
}
export interface PersistTrackingResultInput
  extends z.input<typeof schema.persistTrackingResultSchema> {
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
