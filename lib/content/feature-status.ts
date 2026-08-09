export type FeatureStatus =
  | "shipped"
  | "beta"
  | "open-beta"
  | "building"
  | "planned"
  | "exploring"
  | "cloud-only"
  | "not-planned";

export type FeatureStatusEntry = {
  label: string;
  status: FeatureStatus;
  docs?: string;
  scope?: "self-host";
};

const exploringAvailability = "on the roadmap";

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
    docs: "/docs/guides/alerts",
  },
  alertTemplates: {
    label: "alert templates for ranking and URL changes",
    status: "shipped",
    docs: "/docs/guides/alerts",
  },
  slackAlertDelivery: { label: "Slack alert delivery", status: "planned", docs: "/roadmap" },
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
  auditLog: {
    label: "audit log",
    status: "shipped",
    docs: "/docs/audit-log",
  },
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
    docs: "/roadmap",
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
  domainOverview: { label: "domain overview", status: "planned", docs: "/roadmap" },
  notificationPreferences: {
    label: "advanced notification preferences",
    status: "planned",
    docs: "/roadmap",
  },
  weeklyDigest: {
    label: "weekly email digest",
    status: "shipped",
    docs: "/docs/guides/alerts",
  },
  aiVisibilityTracking: {
    label: "AI Overview and LLM visibility tracking",
    status: "exploring",
    docs: "/roadmap",
  },
  analyticsConnections: {
    label: "Opt-in Google Search Console and Google Analytics 4 connections",
    status: "shipped",
    docs: "/docs/integrations",
    scope: "self-host",
  },
  hostedCloud: { label: "the hosted service", status: "open-beta", docs: "/roadmap" },
} as const satisfies Record<string, FeatureStatusEntry>;

export type FeatureKey = keyof typeof featureStatus;

export const featureDocs = (key: FeatureKey) => featureStatus[key].docs;

export function shippedFeatureLabel(key: FeatureKey) {
  const feature: FeatureStatusEntry = featureStatus[key];
  if (feature.status !== "shipped") {
    throw new Error(
      `Feature ${key} is ${feature.status}; present-tense shipped copy must be updated.`,
    );
  }
  return feature.label;
}

export function featureClaim(key: FeatureKey) {
  const feature: FeatureStatusEntry = featureStatus[key];
  switch (feature.status) {
    case "shipped":
      return `ships ${feature.label}`;
    case "beta":
      return `${feature.label} is available in beta`;
    case "open-beta":
      return `${feature.label} is available in open beta`;
    case "building":
      return `${feature.label} is in development`;
    case "cloud-only":
      return `${feature.label} is available only on the hosted service`;
    case "not-planned":
      return `${feature.label} is not planned`;
    case "planned":
      return `${feature.label} is planned`;
    case "exploring":
      return `${feature.label} is ${exploringAvailability}`;
  }
}

export function sentenceCaseLabel(label: string) {
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

export function featureAvailabilitySentence(key: FeatureKey, verb: "are" | "is" = "is") {
  const feature: FeatureStatusEntry = featureStatus[key];
  const status = feature.status;
  const availability =
    status === "shipped"
      ? "shipped"
      : status === "beta" || status === "building"
        ? "in progress"
        : status === "open-beta"
          ? "available in open beta"
          : status === "cloud-only"
            ? "available only on the hosted service"
            : status === "not-planned"
              ? "not planned"
              : status === "exploring"
                ? exploringAvailability
                : "planned";
  const label = sentenceCaseLabel(feature.label);
  const scope = feature.scope === "self-host" ? " (self-hosted)" : "";
  return `${label} ${verb} ${availability}${scope}.`;
}

export function roadmapItemStatus(
  key: FeatureKey,
): "available" | "in-progress" | "planned" | "exploring" {
  const feature: FeatureStatusEntry = featureStatus[key];
  const status = feature.status;
  if (
    status === "shipped" ||
    status === "beta" ||
    status === "open-beta" ||
    status === "cloud-only"
  ) {
    return "available";
  }
  if (status === "building") return "in-progress";
  if (status === "planned") return "planned";
  return "exploring";
}
