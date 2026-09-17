import type {
  AlertActionHandlers,
  AlertRuleView,
  AlertTargetOptions,
  AlertTemplate,
  TriggeredAlertFeedView,
} from "@/lib/alerts/alert-data";
import type { FeedFacet, FeedFacetOptions } from "@/lib/feeds/facets";

export type AlertsPageContentProps = {
  actions: AlertActionHandlers;
  alerts: TriggeredAlertFeedView[];
  canCreate: boolean;
  canDelete: boolean;
  canManage: boolean;
  canReadAudit: boolean;
  canUpdate: boolean;
  facetOptions?: FeedFacetOptions;
  facets?: FeedFacet[];
  firedInWindowCount: number;
  gscConnected: boolean;
  gscInstallHref: string;
  hasTrackedKeywords: boolean;
  projectDomain?: string | null;
  projectId: string;
  projectRef: string;
  rules: AlertRuleView[];
  snoozedInWindowCount: number;
  targets: AlertTargetOptions;
  templates: AlertTemplate[];
};
