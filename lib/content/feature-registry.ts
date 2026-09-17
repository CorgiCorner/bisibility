export type FeatureStatus =
  | "shipped"
  | "beta"
  | "open-beta"
  | "building"
  | "planned"
  | "exploring"
  | "cloud-only"
  | "not-planned";

/**
 * Maturity is how finished a feature's shape is; `status` stays the availability
 * claim. They are separate dimensions on purpose: Markets is alpha and usable,
 * Search Console Insights is beta and usable, and an unaudited legacy `shipped`
 * entry carries no maturity at all rather than an implied GA.
 */
export type FeatureMaturity = "concept" | "alpha" | "beta";

/** What is currently happening on a feature, for the roadmap's directions index. */
export type FeatureActivity = "researching" | "preparing" | "building" | "maintained";

export type FeatureStatusEntry = {
  label: string;
  status: FeatureStatus;
  activity?: FeatureActivity;
  docs?: string;
  maturity?: FeatureMaturity;
  scope?: "self-host";
};

export const featureStatus = {
  selfHosting: {
    label: "self-hosting",
    status: "shipped",
    docs: "/docs/self-hosting",
  },
  customerDatabase: {
    label: "PostgreSQL database you control",
    status: "shipped",
    docs: "/docs/architecture",
    scope: "self-host",
  },
  directSql: {
    label: "direct SQL access",
    status: "shipped",
    docs: "/docs/architecture",
    scope: "self-host",
  },
  fullHistoryExport: {
    label: "full-history export",
    status: "shipped",
    docs: "/docs/api/rank-history",
  },
  rawSerpPayload: {
    label: "raw SERP payload access",
    status: "shipped",
    docs: "/docs/architecture",
    scope: "self-host",
  },
  providerPortability: {
    label: "SERP provider portability",
    status: "shipped",
    docs: "/docs/integrations",
  },
  rankTracking: {
    label: "rank tracking and schedules",
    status: "shipped",
    docs: "/docs/api/checks",
  },
  rankCheckFrequency: {
    label: "manual, daily, weekly, monthly, and custom cron schedules",
    status: "shipped",
    docs: "/docs/api/keywords",
  },
  tagsAndSavedViews: {
    label: "keyword tags and saved views",
    status: "shipped",
    docs: "/docs/guides/saved-views",
  },
  dashboardInsights: {
    label: "ranking KPI cards and charts",
    status: "shipped",
    docs: "/docs/quickstart",
  },
  perCheckCostTracking: {
    label: "per-check provider cost tracking",
    status: "shipped",
    docs: "/docs/integrations",
  },
  competitorBenchmarking: {
    label: "competitor benchmarking and Share of Voice",
    status: "shipped",
    docs: "/docs/guides/competitors",
  },
  rankAlerts: {
    label: "rank alerts in-app and by email",
    status: "shipped",
    activity: "building",
    docs: "/docs/guides/alerts",
    maturity: "alpha",
  },
  alertTemplates: {
    label: "alert templates for ranking and URL changes",
    status: "shipped",
    docs: "/docs/guides/alerts",
  },
  slackAlertDelivery: {
    label: "Slack alert delivery",
    status: "beta",
    docs: "/docs/guides/alerts",
  },
  webhooks: {
    label: "outbound webhooks",
    status: "shipped",
    docs: "/docs/api/webhooks",
  },
  keywordDetail: {
    label: "keyword detail and ranking history",
    status: "shipped",
    docs: "/docs/api/keywords",
  },
  intendedUrlMonitoring: {
    label: "intended URL monitoring",
    status: "shipped",
    docs: "/docs/api/keywords",
  },
  topicIntentGrouping: {
    label: "topic and intent grouping",
    status: "shipped",
    docs: "/docs/api/keywords",
  },
  userAccounts: {
    label: "user account and session management",
    status: "shipped",
    docs: "/docs/authentication",
  },
  projectSettings: {
    label: "project settings and defaults",
    status: "shipped",
    docs: "/docs/api/projects",
  },
  teamRoles: {
    label: "Owner, Admin, Editor, and Viewer team roles",
    status: "shipped",
    docs: "/docs/guides/teams",
  },
  auditLog: { label: "audit log", status: "shipped", docs: "/docs/audit-log" },
  restApi: {
    label: "REST API v1 and OpenAPI",
    status: "shipped",
    docs: "/docs/api/overview",
  },
  mcp: {
    label: "MCP endpoint and tools",
    status: "shipped",
    docs: "/docs/agents",
  },
  csvExport: {
    label: "CSV export",
    status: "shipped",
    docs: "/docs/api/rank-history",
  },
  setupDocumentation: {
    label: "setup and provider documentation",
    status: "shipped",
    docs: "/docs/quickstart",
  },
  signalsIngestion: {
    label: "signal ingestion for deploys, CMS events, and manual notes",
    status: "shipped",
    docs: "/docs/api/signals",
  },
  gscObservedQueries: {
    label: "Search Console queries, clicks, and impressions per keyword",
    status: "shipped",
    docs: "/docs/guides/analytics",
  },
  presenceChecks: {
    label: "Google index status checks",
    status: "shipped",
    docs: "/docs/guides/analytics",
  },
  visibilityTimeline: {
    label: "visibility timeline",
    status: "shipped",
    docs: "/docs/api/signals",
  },
  keywordSuggestions: {
    label: "keyword suggestions from connected data sources",
    status: "building",
  },
  keywordResearchWorkspace: {
    label: "keyword research workspace",
    status: "shipped",
    docs: "/docs/api/keyword-research",
  },
  backlinkResearch: {
    label: "backlink research",
    status: "shipped",
    docs: "/docs/api/backlinks",
  },
  domainOverview: {
    label: "domain overview",
    status: "shipped",
    docs: "/docs/api/domain-overview",
  },
  notificationPreferences: {
    label: "advanced notification preferences",
    status: "planned",
  },
  weeklyDigest: {
    label: "weekly email digest",
    status: "shipped",
    docs: "/docs/guides/alerts",
  },
  aiVisibilityTracking: {
    label: "dedicated AI visibility and LLM citation tracking",
    status: "exploring",
    activity: "researching",
    docs: "/roadmap",
    maturity: "concept",
  },
  appTranslations: {
    label: "app translations in Spanish, Japanese, and Polish",
    status: "building",
    activity: "preparing",
    docs: "/roadmap",
    maturity: "concept",
  },
  hostedRankCredits: {
    label: "prepaid credits for hosted rank checks",
    status: "exploring",
    activity: "researching",
    docs: "/roadmap",
    maturity: "concept",
  },
  marketWorkspaces: {
    label: "markets with their own keyword sets",
    status: "beta",
    activity: "building",
    docs: "/docs/markets",
    maturity: "alpha",
  },
  publicDemo: {
    label: "the read-only interactive demo",
    status: "beta",
    activity: "building",
    docs: "/docs/quickstart",
    maturity: "alpha",
  },
  // Distinct from slackAlertDelivery: this is the operator-configured instance
  // webhook, not the tenant alert-channel API preview.
  slackIntegration: {
    label: "Slack operational notifications",
    status: "beta",
    activity: "building",
    docs: "/docs/self-hosting/operations",
    maturity: "alpha",
    scope: "self-host",
  },
  // Distinct from gscObservedQueries, which is the per-keyword import rather
  // than the Search Console reporting surface.
  searchConsoleInsights: {
    label: "Search Console Insights",
    status: "beta",
    activity: "maintained",
    docs: "/docs/guides/analytics",
    maturity: "beta",
  },
  analyticsConnections: {
    label: "Opt-in Google Search Console and Google Analytics 4 connections",
    status: "shipped",
    docs: "/docs/integrations",
    scope: "self-host",
  },
  hostedCloud: {
    label: "the hosted service",
    status: "open-beta",
    docs: "/docs/hosted-quickstart",
  },
} as const satisfies Record<string, FeatureStatusEntry>;

export type FeatureKey = keyof typeof featureStatus;
