import { openApiOperationPresentation } from "./openapi-operation-presentation";

export const openApiTags = [
  {
    name: "discovery",
    description: "Discover the API contract, capabilities, health, and public provider pricing.",
    "x-group": "Discovery",
  },
  {
    name: "account-access",
    description: "Manage the authenticated account and personal access tokens.",
    "x-group": "Account & Access",
  },
  {
    name: "projects",
    description: "Create projects and manage their core settings.",
    "x-group": "Projects",
  },
  {
    name: "api-keys",
    description: "Create, list, and revoke API keys.",
    "x-group": "API Keys",
  },
  {
    name: "keywords",
    description: "Manage tracked keywords and exact keyword matching.",
    "x-group": "Keywords",
  },
  {
    name: "rank-checks",
    description: "Run rank checks and retrieve rank-check history.",
    "x-group": "Rank Checks",
  },
  {
    name: "keyword-research",
    description: "Research keywords, metrics, locations, and ranked keyword suggestions.",
    "x-group": "Keyword Research",
  },
  {
    name: "backlinks",
    description: "Analyze backlinks and page through backlink snapshots.",
    "x-group": "Backlinks",
  },
  {
    name: "analytics",
    description: "Read project analytics, traffic snapshots, and search-performance data.",
    "x-group": "Analytics",
  },
  {
    name: "alerts",
    description: "Manage alert rules, triggered alerts, and notification preferences.",
    "x-group": "Alerts",
  },
  {
    name: "competitors",
    description: "Manage project competitors.",
    "x-group": "Competitors",
  },
  {
    name: "sitemap-monitoring",
    description: "Inspect and configure project sitemap monitoring.",
    "x-group": "Sitemap Monitoring",
  },
  {
    name: "saved-views",
    description: "Create, list, and delete saved views.",
    "x-group": "Saved Views",
  },
  {
    name: "signals",
    description: "Ingest and list project signals.",
    "x-group": "Signals",
  },
  {
    name: "providers",
    description: "Connect and configure external providers.",
    "x-group": "Providers",
  },
  {
    name: "webhooks",
    description: "Create and manage webhook endpoints.",
    "x-group": "Webhooks",
  },
  {
    name: "team",
    description: "Manage team members and invitations.",
    "x-group": "Team",
  },
  {
    name: "migration",
    description: "Manage migration tokens and cloud import sessions.",
    "x-group": "Migration",
  },
] as const;

type OpenApiTagName = (typeof openApiTags)[number]["name"];

const operationGroups: ReadonlyArray<readonly [OpenApiTagName, readonly string[]]> = [
  [
    "discovery",
    [
      "getCapabilities",
      "getCostEstimate",
      "getHealth",
      "getLlmsTxt",
      "getOpenApi",
      "getProviderRates",
    ],
  ],
  [
    "account-access",
    [
      "getMe",
      "updateMe",
      "listPersonalAccessTokens",
      "createPersonalAccessToken",
      "revokePersonalAccessToken",
    ],
  ],
  [
    "projects",
    [
      "listProjects",
      "createProject",
      "getProject",
      "updateProject",
      "deleteProject",
      "getProjectDefaults",
      "updateProjectDefaults",
    ],
  ],
  [
    "api-keys",
    ["listApiKeys", "createApiKey", "revokeApiKey", "listProjectApiKeys", "createProjectApiKey"],
  ],
  [
    "keywords",
    [
      "listKeywords",
      "addKeywords",
      "getKeyword",
      "setKeywordTargetUrl",
      "deleteKeyword",
      "bulkUpdateKeywords",
      "matchProjectKeywords",
    ],
  ],
  ["rank-checks", ["runRankCheck", "listRankChecks", "getRankCheckResult", "exportRankHistory"]],
  [
    "keyword-research",
    ["searchLocations", "getKeywordMetrics", "researchKeywords", "listRankedKeywordSuggestions"],
  ],
  ["backlinks", ["analyzeBacklinks", "loadMoreBacklinkRows"]],
  [
    "analytics",
    [
      "getProjectOverview",
      "listSearchPerformanceQueryStats",
      "syncProjectTraffic",
      "listTrafficSnapshots",
    ],
  ],
  [
    "alerts",
    [
      "listAlertRules",
      "createAlertRule",
      "updateAlertRule",
      "deleteAlertRule",
      "listTriggeredAlerts",
      "muteTriggeredAlert",
      "markProjectAlertsRead",
      "getNotificationPreferences",
      "updateNotificationPreferences",
    ],
  ],
  [
    "competitors",
    ["listCompetitors", "addCompetitor", "removeProjectCompetitor", "removeCompetitor"],
  ],
  ["sitemap-monitoring", ["listSitemapMonitors", "updateSitemapMonitor"]],
  [
    "saved-views",
    ["listSavedViews", "createSavedView", "deleteProjectSavedView", "deleteSavedView"],
  ],
  ["signals", ["listSignals", "createSignal"]],
  [
    "providers",
    [
      "listProviders",
      "connectProvider",
      "testProviderConnection",
      "updateProviderSettings",
      "disconnectProvider",
    ],
  ],
  [
    "webhooks",
    [
      "listWebhookEndpoints",
      "createWebhookEndpoint",
      "updateWebhookEndpoint",
      "deleteWebhookEndpoint",
    ],
  ],
  [
    "team",
    [
      "listTeamMembers",
      "updateTeamMemberRole",
      "removeTeamMember",
      "listTeamInvites",
      "createTeamInvite",
      "resendTeamInvite",
      "revokeProjectTeamInvite",
      "revokeTeamInvite",
    ],
  ],
  [
    "migration",
    [
      "listMigrationTokens",
      "mintMigrationToken",
      "revokeProjectMigrationToken",
      "revokeMigrationToken",
      "importCloudExport",
      "getCloudImportCompatibility",
      "createCloudImportSession",
      "uploadCloudImportChunk",
      "finalizeCloudImportSession",
    ],
  ],
];

const operationEntries = operationGroups.flatMap(([tag, operationIds]) =>
  operationIds.map((operationId) => [operationId, tag] as const),
);
const operationTags: Record<string, OpenApiTagName> = Object.fromEntries(operationEntries);

type OpenApiOperation = {
  description?: string;
  operationId?: string;
  summary?: string;
  tags?: string[];
  [key: string]: unknown;
};

type TaggedOperation<T> = T & { summary: string; tags: [OpenApiTagName] };

type TaggedPaths<T extends Record<string, Record<string, object>>> = {
  [Path in keyof T]: {
    [Method in keyof T[Path]]: TaggedOperation<T[Path][Method]>;
  };
};

export function tagOpenApiPaths<T extends Record<string, Record<string, object>>>(
  paths: T,
): TaggedPaths<T> {
  return Object.fromEntries(
    Object.entries(paths).map(([path, methods]) => [
      path,
      Object.fromEntries(
        Object.entries(methods).map(([method, rawOperation]) => {
          const operation = rawOperation as OpenApiOperation;
          if (!operation.operationId) {
            return [method, operation] as const;
          }

          const tag = operationTags[operation.operationId];
          if (!tag) {
            throw new Error(
              `OpenAPI operation "${operation.operationId}" is missing a reference tag`,
            );
          }
          const presentation = openApiOperationPresentation[operation.operationId];
          const description = [operation.description, presentation?.description]
            .filter(Boolean)
            .join(" ");
          return [
            method,
            {
              ...operation,
              ...(presentation ?? {}),
              ...(description ? { description } : {}),
              tags: [tag],
            },
          ] as const;
        }),
      ),
    ]),
  ) as TaggedPaths<T>;
}
