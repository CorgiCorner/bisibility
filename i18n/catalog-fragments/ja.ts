import type { CoreFragmentLoaders } from "./contract";

/** One static import per ja catalog fragment, so each namespace stays a separate chunk. */
export const coreFragments: CoreFragmentLoaders = {
  "account-preferences": () => import("@/messages/core/ja/account-preferences.json"),
  account: () => import("@/messages/core/ja/account.json"),
  auth: () => import("@/messages/core/ja/auth.json"),
  "cloud-import": () => import("@/messages/core/ja/cloud-import.json"),
  "email-preferences": () => import("@/messages/core/ja/email-preferences.json"),
  "instance-admin": () => import("@/messages/core/ja/instance-admin.json"),
  invite: () => import("@/messages/core/ja/invite.json"),
  onboarding: () => import("@/messages/core/ja/onboarding.json"),
  "project-alerts": () => import("@/messages/core/ja/project-alerts.json"),
  "project-audit": () => import("@/messages/core/ja/project-audit.json"),
  "project-backlinks": () => import("@/messages/core/ja/project-backlinks.json"),
  "project-competitors": () => import("@/messages/core/ja/project-competitors.json"),
  "project-cost-estimate": () => import("@/messages/core/ja/project-cost-estimate.json"),
  "project-dashboard": () => import("@/messages/core/ja/project-dashboard.json"),
  "project-domain-overview": () => import("@/messages/core/ja/project-domain-overview.json"),
  "project-getting-started": () => import("@/messages/core/ja/project-getting-started.json"),
  "project-install": () => import("@/messages/core/ja/project-install.json"),
  "project-integrations": () => import("@/messages/core/ja/project-integrations.json"),
  "project-markets": () => import("@/messages/core/ja/project-markets.json"),
  "project-rank-tracker-keyword-detail": () =>
    import("@/messages/core/ja/project-rank-tracker-keyword-detail.json"),
  "project-rank-tracker-keyword-import": () =>
    import("@/messages/core/ja/project-rank-tracker-keyword-import.json"),
  "project-rank-tracker": () => import("@/messages/core/ja/project-rank-tracker.json"),
  "project-research": () => import("@/messages/core/ja/project-research.json"),
  "project-runs-rank-runs": () => import("@/messages/core/ja/project-runs-rank-runs.json"),
  "project-runs-schedules": () => import("@/messages/core/ja/project-runs-schedules.json"),
  "project-runs": () => import("@/messages/core/ja/project-runs.json"),
  "project-search-insights": () => import("@/messages/core/ja/project-search-insights.json"),
  "project-settings-advanced": () => import("@/messages/core/ja/project-settings-advanced.json"),
  "project-settings-developers": () =>
    import("@/messages/core/ja/project-settings-developers.json"),
  "project-settings-experimental": () =>
    import("@/messages/core/ja/project-settings-experimental.json"),
  "project-settings-general": () => import("@/messages/core/ja/project-settings-general.json"),
  "project-settings-migration": () => import("@/messages/core/ja/project-settings-migration.json"),
  "project-settings-notifications": () =>
    import("@/messages/core/ja/project-settings-notifications.json"),
  "project-settings-shell": () => import("@/messages/core/ja/project-settings-shell.json"),
  "project-settings-team": () => import("@/messages/core/ja/project-settings-team.json"),
  "project-settings-tracking": () => import("@/messages/core/ja/project-settings-tracking.json"),
  "project-settings-usage": () => import("@/messages/core/ja/project-settings-usage.json"),
  "project-timeline": () => import("@/messages/core/ja/project-timeline.json"),
  setup: () => import("@/messages/core/ja/setup.json"),
  shared: () => import("@/messages/core/ja/shared.json"),
  shell: () => import("@/messages/core/ja/shell.json"),
};
