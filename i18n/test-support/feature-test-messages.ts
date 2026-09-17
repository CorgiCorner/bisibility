import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import accountMessages from "@/messages/core/en/account.json";
import authMessages from "@/messages/core/en/auth.json";
import cloudImportMessages from "@/messages/core/en/cloud-import.json";
import emailPreferencesMessages from "@/messages/core/en/email-preferences.json";
import instanceAdminMessages from "@/messages/core/en/instance-admin.json";
import inviteMessages from "@/messages/core/en/invite.json";
import onboardingMessages from "@/messages/core/en/onboarding.json";
import projectAlertsMessages from "@/messages/core/en/project-alerts.json";
import projectAuditMessages from "@/messages/core/en/project-audit.json";
import projectBacklinksMessages from "@/messages/core/en/project-backlinks.json";
import projectCompetitorsMessages from "@/messages/core/en/project-competitors.json";
import projectCostEstimateMessages from "@/messages/core/en/project-cost-estimate.json";
import projectDomainOverviewMessages from "@/messages/core/en/project-domain-overview.json";
import projectGettingStartedMessages from "@/messages/core/en/project-getting-started.json";
import projectInstallMessages from "@/messages/core/en/project-install.json";
import projectIntegrationsMessages from "@/messages/core/en/project-integrations.json";
import projectMarketsMessages from "@/messages/core/en/project-markets.json";
import projectRankTrackerMessages from "@/messages/core/en/project-rank-tracker.json";
import projectRankTrackerKeywordDetailMessages from "@/messages/core/en/project-rank-tracker-keyword-detail.json";
import projectRankTrackerKeywordImportMessages from "@/messages/core/en/project-rank-tracker-keyword-import.json";
import projectResearchMessages from "@/messages/core/en/project-research.json";
import projectRunsMessages from "@/messages/core/en/project-runs.json";
import projectRunsRankRunsMessages from "@/messages/core/en/project-runs-rank-runs.json";
import projectRunsSchedulesMessages from "@/messages/core/en/project-runs-schedules.json";
import projectSearchInsightsMessages from "@/messages/core/en/project-search-insights.json";
import projectSettingsAdvancedMessages from "@/messages/core/en/project-settings-advanced.json";
import projectSettingsDevelopersMessages from "@/messages/core/en/project-settings-developers.json";
import projectSettingsExperimentalMessages from "@/messages/core/en/project-settings-experimental.json";
import projectSettingsGeneralMessages from "@/messages/core/en/project-settings-general.json";
import projectSettingsMigrationMessages from "@/messages/core/en/project-settings-migration.json";
import projectSettingsNotificationsMessages from "@/messages/core/en/project-settings-notifications.json";
import projectSettingsShellMessages from "@/messages/core/en/project-settings-shell.json";
import projectSettingsTeamMessages from "@/messages/core/en/project-settings-team.json";
import projectSettingsTrackingMessages from "@/messages/core/en/project-settings-tracking.json";
import projectSettingsUsageMessages from "@/messages/core/en/project-settings-usage.json";
import projectTimelineMessages from "@/messages/core/en/project-timeline.json";
import setupMessages from "@/messages/core/en/setup.json";
import sharedMessages from "@/messages/core/en/shared.json";
import shellMessages from "@/messages/core/en/shell.json";

export const authFeatureTestMessages = mergeMessageCatalogs(sharedMessages, authMessages);
export const inviteFeatureTestMessages = inviteMessages;
export const setupFeatureTestMessages = mergeMessageCatalogs(
  sharedMessages,
  authMessages,
  setupMessages,
);
export const onboardingFeatureTestMessages = mergeMessageCatalogs(
  sharedMessages,
  onboardingMessages,
  projectCostEstimateMessages,
  projectMarketsMessages,
  projectRankTrackerMessages,
  projectRankTrackerKeywordImportMessages,
  projectRunsMessages,
  projectRunsRankRunsMessages,
  projectRunsSchedulesMessages,
);
export const accountFeatureTestMessages = mergeMessageCatalogs(sharedMessages, accountMessages);
export const cloudImportFeatureTestMessages = mergeMessageCatalogs(
  sharedMessages,
  cloudImportMessages,
);
export const instanceAdminFeatureTestMessages = mergeMessageCatalogs(
  sharedMessages,
  instanceAdminMessages,
);
export const emailPreferencesFeatureTestMessages = mergeMessageCatalogs(emailPreferencesMessages);
export const researchFeatureTestMessages = mergeMessageCatalogs(
  sharedMessages,
  projectResearchMessages,
  projectCostEstimateMessages,
  projectMarketsMessages,
  projectRankTrackerMessages,
  projectRankTrackerKeywordImportMessages,
);
export const searchInsightsFeatureTestMessages = mergeMessageCatalogs(
  sharedMessages,
  projectIntegrationsMessages,
  projectSearchInsightsMessages,
);
export const alertsFeatureTestMessages = mergeMessageCatalogs(
  sharedMessages,
  projectAlertsMessages,
);
export const auditFeatureTestMessages = mergeMessageCatalogs(sharedMessages, projectAuditMessages);
export const integrationsFeatureTestMessages = mergeMessageCatalogs(
  sharedMessages,
  projectIntegrationsMessages,
);
export const gettingStartedFeatureTestMessages = mergeMessageCatalogs(
  sharedMessages,
  projectGettingStartedMessages,
  projectRankTrackerMessages,
  projectRankTrackerKeywordImportMessages,
  projectRankTrackerKeywordDetailMessages,
  projectRunsMessages,
  projectRunsRankRunsMessages,
  projectRunsSchedulesMessages,
);
export const installFeatureTestMessages = mergeMessageCatalogs(
  sharedMessages,
  projectInstallMessages,
);
export const costEstimateFeatureTestMessages = mergeMessageCatalogs(
  sharedMessages,
  projectCostEstimateMessages,
);
export const timelineFeatureTestMessages = mergeMessageCatalogs(
  sharedMessages,
  projectTimelineMessages,
);
export const shellFeatureTestMessages = mergeMessageCatalogs(sharedMessages, shellMessages);
export const projectRankTrackerFeatureTestMessages = mergeMessageCatalogs(
  sharedMessages,
  projectCostEstimateMessages,
  projectMarketsMessages,
  projectRankTrackerMessages,
  projectRankTrackerKeywordImportMessages,
  projectRankTrackerKeywordDetailMessages,
  projectRunsMessages,
  projectRunsRankRunsMessages,
  projectRunsSchedulesMessages,
);
export const backlinksFeatureTestMessages = mergeMessageCatalogs(
  sharedMessages,
  projectBacklinksMessages,
  projectResearchMessages,
);
export const competitorsFeatureTestMessages = mergeMessageCatalogs(
  sharedMessages,
  projectRankTrackerMessages,
  projectRankTrackerKeywordImportMessages,
  projectRankTrackerKeywordDetailMessages,
  projectCompetitorsMessages,
  projectMarketsMessages,
  projectRunsMessages,
  projectRunsRankRunsMessages,
  projectRunsSchedulesMessages,
);
export const domainOverviewFeatureTestMessages = mergeMessageCatalogs(
  sharedMessages,
  projectDomainOverviewMessages,
  projectCostEstimateMessages,
  projectResearchMessages,
  projectRankTrackerMessages,
  projectRankTrackerKeywordImportMessages,
);
/** The exact payload `loadKeywordManagementMessages` serializes for the add-keyword surfaces. */
export const keywordManagementFeatureTestMessages = mergeMessageCatalogs(
  sharedMessages,
  projectMarketsMessages,
  projectRankTrackerMessages,
  projectRankTrackerKeywordImportMessages,
  projectRankTrackerKeywordDetailMessages,
  projectRunsMessages,
  projectRunsRankRunsMessages,
  projectRunsSchedulesMessages,
);
export const projectMarketsFeatureTestMessages = mergeMessageCatalogs(
  sharedMessages,
  projectCostEstimateMessages,
  projectMarketsMessages,
  projectRankTrackerMessages,
  projectRankTrackerKeywordImportMessages,
  projectRankTrackerKeywordDetailMessages,
  projectRunsMessages,
  projectRunsRankRunsMessages,
  projectRunsSchedulesMessages,
);
export const shellProjectRankTrackerFeatureTestMessages = mergeMessageCatalogs(
  sharedMessages,
  shellMessages,
  projectMarketsMessages,
  projectRankTrackerMessages,
  projectRankTrackerKeywordImportMessages,
  projectRankTrackerKeywordDetailMessages,
);
export const projectRunsFeatureTestMessages = mergeMessageCatalogs(
  sharedMessages,
  projectRunsMessages,
  projectRunsRankRunsMessages,
  projectRunsSchedulesMessages,
);
export const sharedControlTestMessages = sharedMessages;
export const settingsShellFeatureTestMessages = mergeMessageCatalogs(
  sharedMessages,
  projectSettingsShellMessages,
);
export const generalSettingsFeatureTestMessages = mergeMessageCatalogs(
  sharedMessages,
  projectSettingsShellMessages,
  projectSettingsGeneralMessages,
);
export const notificationSettingsFeatureTestMessages = mergeMessageCatalogs(
  sharedMessages,
  projectSettingsShellMessages,
  projectSettingsNotificationsMessages,
);
export const trackingSettingsFeatureTestMessages = mergeMessageCatalogs(
  sharedMessages,
  projectSettingsShellMessages,
  projectSettingsTrackingMessages,
);
export const teamSettingsFeatureTestMessages = mergeMessageCatalogs(
  sharedMessages,
  projectSettingsShellMessages,
  projectSettingsTeamMessages,
);
export const developersSettingsFeatureTestMessages = mergeMessageCatalogs(
  sharedMessages,
  projectSettingsShellMessages,
  projectSettingsDevelopersMessages,
);
export const usageSettingsFeatureTestMessages = mergeMessageCatalogs(
  sharedMessages,
  projectSettingsShellMessages,
  projectSettingsUsageMessages,
);
export const advancedSettingsFeatureTestMessages = mergeMessageCatalogs(
  sharedMessages,
  projectSettingsShellMessages,
  projectSettingsAdvancedMessages,
  projectSettingsMigrationMessages,
);
export const experimentalSettingsFeatureTestMessages = mergeMessageCatalogs(
  sharedMessages,
  projectSettingsShellMessages,
  projectSettingsExperimentalMessages,
);
