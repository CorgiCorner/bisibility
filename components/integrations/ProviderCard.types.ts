import type { IntegrationProviderData, ProviderActionHandlers } from "@/lib/integrations/types";
import type { ProjectRef } from "@/lib/routing/app-path";
import type { SearchSyncPreflightPlan } from "@/lib/search-insights/sync/plan";

export type ProviderCardProps = {
  actions?: ProviderActionHandlers;
  canManageProviders: boolean;
  canUpdateProject: boolean;
  consumerDetails?: "inline" | "separate";
  deploymentMode?: "cloud" | "self-host";
  initialOpen?: boolean;
  noProvidersYet?: boolean;
  projectId?: string;
  projectRef?: ProjectRef;
  provider: IntegrationProviderData;
  searchSyncPlan?: SearchSyncPreflightPlan;
  timeZone: string;
};
