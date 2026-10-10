import type {
  Evidence,
  MeasurementState,
  RunState,
  SourceConfiguration,
  TrackingSource,
} from "@/lib/ai-tracking/contract";
export interface TrackingPromptRow {
  id: string;
  text: string;
  label: string | null;
  topicId: string | null;
  topicName: string;
  revisionId: string;
  revision: number;
  category: "neutral" | "comparative" | "branded";
  status: "active" | "paused" | "archived";
  sources?: TrackingSource[];
  lastResult?: {
    sampleId: string;
    revisionId: string;
    text: string;
    measurement: MeasurementState;
    observedAt: string | null;
    recordedAt: string;
  } | null;
  nextRunAt?: string | null;
  nextRunPending?: boolean;
  sourceScopeLimited?: boolean;
  sourceProvenance?: "manual" | "model_generated_hypothesis" | "provider_dataset";
}
export type TrackingPromptDraft = {
  text: string;
  category: "neutral" | "comparative" | "branded";
  generationReference?: { generationId: string; draftId: string };
  providerDatasetReference?: { reportId: string; rowIndex: number };
};
export interface TrackingRunRow {
  id: string;
  state: RunState;
  createdAt: string;
  sampleCount: number;
}
export interface TrackingSampleRow {
  id: string;
  measurement: MeasurementState;
  source: TrackingSource;
  engine: string;
  prompt: string;
  promptRevisionId: string;
  evidence: Evidence | null;
  citations: { url: string; title: string | null; position: number }[];
  costUsd: string | null;
  costState: string;
}
export interface TrackingWorkspaceData {
  topics: { id: string; name: string; description: string | null; status: string }[];
  prompts: TrackingPromptRow[];
  runs: TrackingRunRow[];
  runsNextCursor?: string | null;
  schedules: {
    id: string;
    name: string;
    cron: string;
    timezone: string;
    enabled: boolean;
    promptIds?: string[];
    configurations?: SourceConfiguration[];
    nextRunAt?: string | null;
  }[];
  canWrite: boolean;
  domain: string;
}
export type TrackingTrendView = {
  current: ReturnType<typeof import("@/lib/ai-tracking/projections/trends").trackingDenominator>;
  strata?: (ReturnType<
    typeof import("@/lib/ai-tracking/projections/trends").compareTrackingPeriods
  > & { category: string })[];
  previous?: ReturnType<typeof import("@/lib/ai-tracking/projections/trends").trackingDenominator>;
  comparable: boolean;
  reason: string | null;
  delta: number | null;
  currentRunId: string;
  previousRunId?: string;
  nextCursor: string | null;
};

export interface TrackingPreview {
  configurations: SourceConfiguration[];
  credentialConnectionId: string;
  credentialVersion: string;
  budgetRevision: string;
  consentRevision: string;
  estimatedCostCents: number;
}
