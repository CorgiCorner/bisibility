import type { AiCatalogOutcome } from "@/lib/ai-research/catalog-types";
import type { SourceConfiguration } from "@/lib/ai-tracking/contract";
import type { TrackingSuggestion } from "@/lib/ai-tracking/suggestions/context";
import type {
  SuggestionGenerationPreview,
  SuggestionGenerationPreviewInput,
  SuggestionGenerationResult,
  SuggestionGenerationSnapshot,
} from "@/lib/ai-tracking/suggestions/generation-schema";
import type {
  TrackingPreview,
  TrackingRunRow,
  TrackingSampleRow,
  TrackingTrendView,
  TrackingWorkspaceData,
} from "./workspace";
export interface TrackingWorkspaceActions {
  generation?: {
    review: () => Promise<{
      inputSnapshot: SuggestionGenerationSnapshot;
      contextUpdatedAt: string | null;
    }>;
    preview: (input: SuggestionGenerationPreviewInput) => Promise<SuggestionGenerationPreview>;
    generate: (
      preview: SuggestionGenerationPreview,
      idempotencyKey: string,
    ) => Promise<SuggestionGenerationResult>;
  };
  catalog?: () => Promise<AiCatalogOutcome>;
  save: (
    resource: "topics" | "prompts" | "schedules",
    method: "POST" | "PATCH" | "DELETE",
    input: unknown,
    member?: string,
  ) => Promise<TrackingWorkspaceData>;
  preview: (promptIds: string[], configurations: SourceConfiguration[]) => Promise<TrackingPreview>;
  launch: (promptIds: string[], preview: TrackingPreview) => Promise<TrackingWorkspaceData>;
  runs: (cursor?: string) => Promise<{ items: TrackingRunRow[]; nextCursor: string | null }>;
  samples: (
    runId: string,
    cursor?: string,
  ) => Promise<{ items: TrackingSampleRow[]; nextCursor: string | null }>;
  cancel: (runId: string) => Promise<TrackingWorkspaceData>;
  compare: (current: string, previous: string) => Promise<TrackingTrendView>;
  export: (
    run: string,
    format: "json" | "csv",
    cursor?: string,
  ) => Promise<{
    complete: boolean;
    loaded: number;
    nextCursor: string | null;
  }>;
  suggest: () => Promise<{ drafts: TrackingSuggestion[]; method: string; limitations: string[] }>;
}
