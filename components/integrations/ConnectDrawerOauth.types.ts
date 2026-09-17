import type { OAuthScope } from "@/components/integrations/provider-auth";
import type {
  GoogleOAuthSetup,
  GooglePropertySaveResult,
  IntegrationProviderData,
  ProviderActionHandlers,
} from "@/lib/integrations/types";
import type { ProjectRef } from "@/lib/routing/app-path";
import type { SearchSyncPreflightPlan } from "@/lib/search-insights/sync/plan";

export type SearchSyncSelection = Pick<SearchSyncPreflightPlan, "pace" | "retentionMonths">;

export type ConnectDrawerOauthProps = {
  completePropertySelection?: (input: {
    pace?: SearchSyncSelection["pace"];
    projectId: string;
    property: string;
    retentionMonths?: SearchSyncSelection["retentionMonths"];
  }) => Promise<{ property: string }>;
  disconnectProvider?: ProviderActionHandlers["disconnectProvider"];
  loadStoredProperties?: (input: {
    projectId: string;
    provider: "ga4" | "gsc";
  }) => Promise<GoogleOAuthSetup>;
  onDisconnected?: () => void;
  projectId?: string;
  projectRef?: ProjectRef;
  provider: IntegrationProviderData;
  saveStoredProperty?: (input: {
    pace?: SearchSyncSelection["pace"];
    projectId: string;
    property: string;
    provider: "ga4" | "gsc";
    retentionMonths?: SearchSyncSelection["retentionMonths"];
  }) => Promise<GooglePropertySaveResult>;
  scopes: readonly (OAuthScope | string)[];
  syncPlan: SearchSyncPreflightPlan | undefined;
};
