import type { AiCatalogOutcome } from "@/lib/ai-research/catalog-types";
import type { SourceConfiguration } from "@/lib/ai-tracking/contract";
import type {
  TrackingPreview,
  TrackingWorkspaceData,
} from "@/lib/ai-tracking/projections/workspace";
export type TrackingRunDrawerProps = {
  open: boolean;
  count: number;
  onClose: () => void;
  onPreview: (
    configurations: SourceConfiguration[],
    payment?: {
      paymentScope: "manual" | "recurring";
      paymentRecurrence?: { cron: string; timezone: string };
      paymentScheduleId?: string;
    },
  ) => Promise<TrackingPreview>;
  onLaunch: (
    preview: TrackingPreview,
    schedule?: { name: string; cron: string; timezone: string; enabled: boolean; consent: boolean },
  ) => Promise<void>;
  pending: boolean;
  schedule?: TrackingWorkspaceData["schedules"][number];
  onSaveMetadata?: (metadata: {
    name: string;
    cron: string;
    timezone: string;
    enabled: boolean;
  }) => Promise<void>;
  scheduleMode?: boolean;
  onCatalog?: () => Promise<AiCatalogOutcome>;
  mutationError?: string | null;
};
