import account from "@/messages/core/en/account.json";
import accountPreferences from "@/messages/core/en/account-preferences.json";
import auth from "@/messages/core/en/auth.json";
import cloudImport from "@/messages/core/en/cloud-import.json";
import emailPreferences from "@/messages/core/en/email-preferences.json";
import instanceAdmin from "@/messages/core/en/instance-admin.json";
import invite from "@/messages/core/en/invite.json";
import onboarding from "@/messages/core/en/onboarding.json";
import projectAlerts from "@/messages/core/en/project-alerts.json";
import projectAudit from "@/messages/core/en/project-audit.json";
import projectBacklinks from "@/messages/core/en/project-backlinks.json";
import projectCompetitors from "@/messages/core/en/project-competitors.json";
import projectCostEstimate from "@/messages/core/en/project-cost-estimate.json";
import projectDashboard from "@/messages/core/en/project-dashboard.json";
import projectDomainOverview from "@/messages/core/en/project-domain-overview.json";
import projectGettingStarted from "@/messages/core/en/project-getting-started.json";
import projectInstall from "@/messages/core/en/project-install.json";
import projectIntegrations from "@/messages/core/en/project-integrations.json";
import projectMarkets from "@/messages/core/en/project-markets.json";
import projectRankTracker from "@/messages/core/en/project-rank-tracker.json";
import projectRankTrackerKeywordDetail from "@/messages/core/en/project-rank-tracker-keyword-detail.json";
import projectRankTrackerKeywordImport from "@/messages/core/en/project-rank-tracker-keyword-import.json";
import projectResearch from "@/messages/core/en/project-research.json";
import projectRuns from "@/messages/core/en/project-runs.json";
import projectRunsRankRuns from "@/messages/core/en/project-runs-rank-runs.json";
import projectRunsSchedules from "@/messages/core/en/project-runs-schedules.json";
import projectSearchInsights from "@/messages/core/en/project-search-insights.json";
import projectSettingsAdvanced from "@/messages/core/en/project-settings-advanced.json";
import projectSettingsDevelopers from "@/messages/core/en/project-settings-developers.json";
import projectSettingsExperimental from "@/messages/core/en/project-settings-experimental.json";
import projectSettingsGeneral from "@/messages/core/en/project-settings-general.json";
import projectSettingsMigration from "@/messages/core/en/project-settings-migration.json";
import projectSettingsNotifications from "@/messages/core/en/project-settings-notifications.json";
import projectSettingsShell from "@/messages/core/en/project-settings-shell.json";
import projectSettingsTeam from "@/messages/core/en/project-settings-team.json";
import projectSettingsTracking from "@/messages/core/en/project-settings-tracking.json";
import projectSettingsUsage from "@/messages/core/en/project-settings-usage.json";
import projectTimeline from "@/messages/core/en/project-timeline.json";
import setup from "@/messages/core/en/setup.json";
import shared from "@/messages/core/en/shared.json";
import shell from "@/messages/core/en/shell.json";
import { mergeMessageCatalogs } from "./catalog-contract";
import type { CoreMessages } from "./core-messages.generated";

/** Private adapters augment this without making hosted catalogs a core dependency. */
// biome-ignore lint/suspicious/noEmptyInterface: Private catalog types extend this port.
export interface HostedMessageExtensions {}

export type AppMessages = CoreMessages & HostedMessageExtensions;

export const sharedMessages = shared as unknown as Pick<CoreMessages, "shared">;
export const coreMessages = mergeMessageCatalogs(
  shared,
  auth,
  cloudImport,
  emailPreferences,
  instanceAdmin,
  invite,
  onboarding,
  account,
  accountPreferences,
  projectAlerts,
  projectAudit,
  projectBacklinks,
  projectCompetitors,
  projectCostEstimate,
  projectDomainOverview,
  projectDashboard,
  projectGettingStarted,
  projectInstall,
  projectIntegrations,
  projectMarkets,
  projectRankTracker,
  projectRankTrackerKeywordImport,
  projectRankTrackerKeywordDetail,
  projectResearch,
  projectRuns,
  projectRunsRankRuns,
  projectRunsSchedules,
  projectSearchInsights,
  projectSettingsAdvanced,
  projectSettingsDevelopers,
  projectSettingsExperimental,
  projectSettingsGeneral,
  projectSettingsMigration,
  projectSettingsNotifications,
  projectSettingsShell,
  projectSettingsTeam,
  projectSettingsTracking,
  projectSettingsUsage,
  projectTimeline,
  setup,
  shell,
) as CoreMessages;
