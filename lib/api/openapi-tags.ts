import { openApiOperationPresentation } from "./openapi-operation-presentation";
import { withApiVersionContract } from "./openapi-versioning";
import { assertOperationPolicy } from "./operation-policy";

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
    name: "domain-overview",
    description: "Analyze domain visibility and load its history, keywords, and pages.",
    "x-group": "Domain Overview",
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
    name: "saved-keywords",
    description: "Save keywords for later without putting them under rank tracking.",
    "x-group": "Saved Keywords",
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
    description: "Manage migration tokens and instance import sessions.",
    "x-group": "Migration",
  },
] as const;

type OpenApiTagName = (typeof openApiTags)[number]["name"];

import { operationGroups } from "./openapi-operation-groups";

const operationEntries = operationGroups.flatMap(([tag, operationIds]) =>
  operationIds.map((operationId) => [operationId, tag] as const),
);
const operationTags: Record<string, OpenApiTagName> = Object.fromEntries(operationEntries);

type OpenApiOperation = {
  description?: string;
  operationId?: string;
  parameters?: object[];
  responses?: Record<string, unknown>;
  summary?: string;
  tags?: string[];
  [key: string]: unknown;
};

type TaggedOperation<T> = T & {
  parameters: object[];
  responses: Record<string, unknown>;
  summary: string;
  tags: [OpenApiTagName];
};

type TaggedPaths<T extends Record<string, Record<string, object>>> = {
  [Path in keyof T]: {
    [Method in keyof T[Path]]: TaggedOperation<T[Path][Method]>;
  };
};

function usesApiCredential(operation: OpenApiOperation) {
  return (
    Array.isArray(operation.security) &&
    operation.security.some(
      (requirement) =>
        requirement &&
        typeof requirement === "object" &&
        ("PersonalAccessToken" in requirement || "ProjectApiKey" in requirement),
    )
  );
}

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
          if (usesApiCredential(operation)) {
            assertOperationPolicy(operation.operationId, method, path);
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
              ...withApiVersionContract(operation),
              tags: [tag],
            },
          ] as const;
        }),
      ),
    ]),
  ) as TaggedPaths<T>;
}
