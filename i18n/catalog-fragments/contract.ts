/**
 * The catalog fragment files every active locale ships. The names are identical
 * across locales, so a namespace maps to the same fragment list in each of them.
 */
export type CoreFragmentFile =
  | "project-ai-research"
  | "project-site-audit"
  | "agent-workspace"
  | "account-preferences"
  | "account"
  | "auth"
  | "cloud-import"
  | "email-preferences"
  | "instance-admin"
  | "invite"
  | "onboarding"
  | "project-alerts"
  | "project-audit"
  | "project-backlinks"
  | "project-competitors"
  | "project-cost-estimate"
  | "project-dashboard"
  | "project-domain-overview"
  | "project-getting-started"
  | "project-install"
  | "project-integrations"
  | "project-markets"
  | "project-rank-tracker-keyword-detail"
  | "project-rank-tracker-keyword-import"
  | "project-rank-tracker"
  | "project-research"
  | "project-runs-rank-runs"
  | "project-runs-schedules"
  | "project-runs"
  | "project-search-insights"
  | "project-settings-advanced"
  | "project-settings-developers"
  | "project-settings-experimental"
  | "project-settings-general"
  | "project-settings-migration"
  | "project-settings-notifications"
  | "project-settings-shell"
  | "project-settings-team"
  | "project-settings-tracking"
  | "project-settings-usage"
  | "project-timeline"
  | "setup"
  | "shared"
  | "shell";

export type CoreFragmentLoaders = Readonly<
  Record<CoreFragmentFile, () => Promise<{ default: unknown }>>
>;
