import type { CoreFragmentLoaders } from "./contract";

/** One static import per es-ES catalog fragment, so each namespace stays a separate chunk. */
export const coreFragments: CoreFragmentLoaders = {
  "account-preferences": () => import("@/messages/core/es-ES/account-preferences.json"),
  account: () => import("@/messages/core/es-ES/account.json"),
  auth: () => import("@/messages/core/es-ES/auth.json"),
  "cloud-import": () => import("@/messages/core/es-ES/cloud-import.json"),
  "email-preferences": () => import("@/messages/core/es-ES/email-preferences.json"),
  "instance-admin": () => import("@/messages/core/es-ES/instance-admin.json"),
  invite: () => import("@/messages/core/es-ES/invite.json"),
  onboarding: () => import("@/messages/core/es-ES/onboarding.json"),
  "project-alerts": () => import("@/messages/core/es-ES/project-alerts.json"),
  "project-audit": () => import("@/messages/core/es-ES/project-audit.json"),
  "project-backlinks": () => import("@/messages/core/es-ES/project-backlinks.json"),
  "project-competitors": () => import("@/messages/core/es-ES/project-competitors.json"),
  "project-cost-estimate": () => import("@/messages/core/es-ES/project-cost-estimate.json"),
  "project-dashboard": () => import("@/messages/core/es-ES/project-dashboard.json"),
  "project-domain-overview": () => import("@/messages/core/es-ES/project-domain-overview.json"),
  "project-getting-started": () => import("@/messages/core/es-ES/project-getting-started.json"),
  "project-install": () => import("@/messages/core/es-ES/project-install.json"),
  "project-integrations": () => import("@/messages/core/es-ES/project-integrations.json"),
  "project-markets": () => import("@/messages/core/es-ES/project-markets.json"),
  "project-rank-tracker-keyword-detail": () =>
    import("@/messages/core/es-ES/project-rank-tracker-keyword-detail.json"),
  "project-rank-tracker-keyword-import": () =>
    import("@/messages/core/es-ES/project-rank-tracker-keyword-import.json"),
  "project-rank-tracker": () => import("@/messages/core/es-ES/project-rank-tracker.json"),
  "project-research": () => import("@/messages/core/es-ES/project-research.json"),
  "project-runs-rank-runs": () => import("@/messages/core/es-ES/project-runs-rank-runs.json"),
  "project-runs-schedules": () => import("@/messages/core/es-ES/project-runs-schedules.json"),
  "project-runs": () => import("@/messages/core/es-ES/project-runs.json"),
  "project-search-insights": () => import("@/messages/core/es-ES/project-search-insights.json"),
  "project-settings-advanced": () => import("@/messages/core/es-ES/project-settings-advanced.json"),
  "project-settings-developers": () =>
    import("@/messages/core/es-ES/project-settings-developers.json"),
  "project-settings-experimental": () =>
    import("@/messages/core/es-ES/project-settings-experimental.json"),
  "project-settings-general": () => import("@/messages/core/es-ES/project-settings-general.json"),
  "project-settings-migration": () =>
    import("@/messages/core/es-ES/project-settings-migration.json"),
  "project-settings-notifications": () =>
    import("@/messages/core/es-ES/project-settings-notifications.json"),
  "project-settings-shell": () => import("@/messages/core/es-ES/project-settings-shell.json"),
  "project-settings-team": () => import("@/messages/core/es-ES/project-settings-team.json"),
  "project-settings-tracking": () => import("@/messages/core/es-ES/project-settings-tracking.json"),
  "project-settings-usage": () => import("@/messages/core/es-ES/project-settings-usage.json"),
  "project-timeline": () => import("@/messages/core/es-ES/project-timeline.json"),
  setup: () => import("@/messages/core/es-ES/setup.json"),
  shared: () => import("@/messages/core/es-ES/shared.json"),
  shell: () => import("@/messages/core/es-ES/shell.json"),
};
