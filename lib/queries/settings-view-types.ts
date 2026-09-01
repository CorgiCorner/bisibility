import type { TrackingScope } from "@/lib/schemas/project";
import type { ImportObservabilityFacts } from "@/lib/search-insights/queries/import-observability";
import type {
  SearchImportQueueFacts,
  SearchImportRuntimeFacts,
} from "@/lib/search-insights/sync/control-model";
import type { SerpDepth } from "@/lib/serp/markets";
import type { ProviderUsageData } from "@/lib/settings/options";
import type { ProjectProviderSpend } from "./provider-spend";
import type { SettingsProviderSummary } from "./settings-provider-summaries";

export type SettingsView = {
  apiKeys: {
    createdLabel: string;
    expiresLabel: string;
    id: string;
    isExpired: boolean;
    lastUsedLabel: string;
    maskedValue: string;
    name: string;
  }[];
  defaults: {
    city: string | null;
    locationKey: string;
    locationLabel: string;
    costPerCheck: number;
    country: string;
    device: string;
    deviceCount: number;
    keywordCount: number;
    inspectionDailyLimit: number;
    searchSync: {
      connectionStatus: "connected" | "connected_no_property" | "needs_reauth" | "not_connected";
      firstDataDate: string | null;
      firstDataDateLabel: string | null;
      lastQuotaPausedAt: string | null;
      pace: "normal" | "gentle";
      lastActivityAt: string | null;
      pauseStartedAt: string | null;
      pausedReason: string | null;
      safeError: string | null;
      state: string | null;
      newestFinalizedDate: string | null;
      observability?: ImportObservabilityFacts;
      plannedRemaining: number;
      queue?: SearchImportQueueFacts;
      requestsToday: number;
      retentionMonths: 3 | 6 | 12 | 16;
      runtime?: SearchImportRuntimeFacts;
    };
    locationCount: number;
    serpDepth: SerpDepth;
    serpStopOnMatch: boolean;
    schedule: {
      cron_expression: string | null;
      frequency: "custom_cron" | "daily" | "manual" | "monthly" | "paused" | "weekly";
      jitter_minutes: number;
      last_checked_at: string | null;
      next_check_at: string | null;
      timezone: string;
    };
    targetUrlCount: number;
  };
  notifications: {
    channel: "Email";
    digest: "Daily";
    email: string;
    emailVerification: "unverified" | "verified";
    maxAlertsPerDay: number;
  };
  project: {
    domain: string;
    name: string;
    projectId: string;
    trackingScope: TrackingScope;
    writeMode: "active" | "migration_hold" | "migrated";
  };
  providers: SettingsProviderSummary[];
  tags: { color: string; count: number; label: string }[];
  team: {
    color: "accent" | "blue" | "purple";
    email: string;
    id: string;
    initials: string;
    name: string;
    role: "Editor" | "Owner" | "Viewer";
    userId: string;
  }[];
  usage: { providerSpend: ProjectProviderSpend } & ProviderUsageData;
};
