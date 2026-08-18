import { signalSourceValues } from "./openapi-signal-components";
import { COST_ESTIMATE_MAX_KEYWORDS, COST_ESTIMATE_MAX_LOCATIONS } from "./public-cost";

function queryParameter(name: string, description: string, schema: object, required?: boolean) {
  return { description, in: "query", name, ...(required ? { required } : {}), schema };
}

export const asyncParameter = queryParameter(
  "async",
  "When true, enqueue the check and return a running rank-check resource.",
  { type: "boolean" },
);

export const projectOverviewParameters = [
  queryParameter("range", "Rank-history window used for overview comparisons.", {
    default: "28d",
    enum: ["7d", "28d", "90d"],
    type: "string",
  }),
  queryParameter("device", "Filter tracked keywords by SERP device.", {
    default: "all",
    enum: ["all", "desktop", "mobile"],
    type: "string",
  }),
  queryParameter("tag", "Filter tracked keywords by exact tag name.", {
    maxLength: 48,
    type: "string",
  }),
];

export const rankCheckListParameters = [
  queryParameter("limit", "Maximum rank checks to return. Defaults to 50.", {
    default: 50,
    maximum: 200,
    minimum: 1,
    type: "integer",
  }),
  queryParameter(
    "cursor",
    "Opaque v3 cursor returned as meta.next_cursor from the previous page.",
    {
      type: "string",
    },
  ),
  queryParameter("status", "Filter by persisted rank-check status.", {
    enum: ["completed", "failed", "running"],
    type: "string",
  }),
  queryParameter("since", "Return checks at or after this ISO-8601 date-time.", {
    format: "date-time",
    type: "string",
  }),
  queryParameter("until", "Return checks at or before this ISO-8601 date-time.", {
    format: "date-time",
    type: "string",
  }),
];

export const keywordListParameters = [
  queryParameter("limit", "Maximum keywords to return. Defaults to 50.", {
    default: 50,
    maximum: 200,
    minimum: 1,
    type: "integer",
  }),
  queryParameter(
    "cursor",
    "Opaque v3 cursor returned as meta.next_cursor from the previous page.",
    {
      type: "string",
    },
  ),
  queryParameter("search", "Case-insensitive keyword text search. Also accepted as q.", {
    type: "string",
  }),
  queryParameter("tag", "Case-insensitive exact tag filter. Also accepted as filter[tag].", {
    type: "string",
  }),
  queryParameter("topic", "Case-insensitive exact topic filter. Also accepted as filter[topic].", {
    maxLength: 80,
    minLength: 1,
    type: "string",
  }),
  queryParameter(
    "intent",
    "Case-insensitive exact intent filter. Also accepted as filter[intent].",
    {
      maxLength: 80,
      minLength: 1,
      type: "string",
    },
  ),
  queryParameter("device", "Filter by SERP device. Also accepted as filter[device].", {
    enum: ["desktop", "mobile"],
    type: "string",
  }),
  queryParameter(
    "country",
    "Filter by canonical country or stored location alias. Also accepted as filter[country].",
    {
      type: "string",
    },
  ),
  queryParameter(
    "position_gt",
    "Match keywords with a rank check position greater than this number. Also accepted as filter[position_gt].",
    {
      type: "number",
    },
  ),
  queryParameter(
    "position_lt",
    "Match keywords with a rank check position less than this number. Also accepted as filter[position_lt].",
    {
      type: "number",
    },
  ),
  queryParameter("sort", "Sort order for the keyword list.", {
    default: "-created_at",
    enum: [
      "created_at",
      "-created_at",
      "keyword",
      "-keyword",
      "text",
      "-text",
      "updated_at",
      "-updated_at",
    ],
    type: "string",
  }),
];

export const signalListParameters = [
  queryParameter("limit", "Maximum signals to return. Defaults to 50.", {
    default: 50,
    maximum: 200,
    minimum: 1,
    type: "integer",
  }),
  queryParameter(
    "cursor",
    "Opaque v3 cursor returned as meta.next_cursor from the previous page.",
    {
      type: "string",
    },
  ),
  queryParameter("source", "Filter by signal source.", {
    enum: signalSourceValues,
    type: "string",
  }),
  queryParameter("type", "Filter by signal type.", {
    type: "string",
  }),
  queryParameter("from", "Return signals at or after this ISO-8601 date-time.", {
    format: "date-time",
    type: "string",
  }),
  queryParameter("to", "Return signals at or before this ISO-8601 date-time.", {
    format: "date-time",
    type: "string",
  }),
];

export const projectSelectionParameterComponents = {
  ProjectHeader: {
    description:
      "Project public ID (prj_...) targeted by this personal-access-token request. Optional. Selection precedence is: {project_id} path parameter, X-Bisibility-Project header, project query parameter, then inference when the PAT owner belongs to exactly one project. Project API keys and paths that already carry a project ID ignore it.",
    in: "header",
    name: "X-Bisibility-Project",
    required: false,
    schema: { type: "string" },
  },
  ProjectQuery: {
    description:
      "Query-parameter equivalent of the X-Bisibility-Project header for personal-access-token project selection. Optional. Selection precedence is: {project_id} path parameter, X-Bisibility-Project header, project query parameter, then inference when the PAT owner belongs to exactly one project.",
    in: "query",
    name: "project",
    required: false,
    schema: { type: "string" },
  },
};

const projectSelectionParameterRefs = [
  { $ref: "#/components/parameters/ProjectHeader" },
  { $ref: "#/components/parameters/ProjectQuery" },
];

// Account routes and the project-less location search never resolve a project;
// paths carrying a project ID resolve it from the path instead of the header.
const PROJECT_SELECTION_EXEMPT = /^\/(me(\/|$)|projects$|locations\/search$)|\{project_?[iI]d\}/;

type ProjectSelectableOperation = { parameters?: object[]; security?: unknown };

function acceptsPersonalAccessToken(operation: ProjectSelectableOperation) {
  return (
    Array.isArray(operation.security) &&
    operation.security.some(
      (requirement) =>
        requirement && typeof requirement === "object" && "PersonalAccessToken" in requirement,
    )
  );
}

/**
 * Declares the runtime project-selection contract of lib/api/personal-scope.ts
 * on every personal-access-token operation that resolves a project at request
 * time, so generated clients can target a project on non-project paths.
 */
export function withProjectSelectionParameters<T extends Record<string, Record<string, object>>>(
  paths: T,
): T {
  return Object.fromEntries(
    Object.entries(paths).map(([path, methods]) => {
      if (PROJECT_SELECTION_EXEMPT.test(path)) return [path, methods];
      return [
        path,
        Object.fromEntries(
          Object.entries(methods).map(([method, operation]) => {
            if (!acceptsPersonalAccessToken(operation as ProjectSelectableOperation)) {
              return [method, operation];
            }
            const parameters = (operation as ProjectSelectableOperation).parameters ?? [];
            return [
              method,
              { ...operation, parameters: [...parameters, ...projectSelectionParameterRefs] },
            ];
          }),
        ),
      ];
    }),
  ) as T;
}

export const costEstimateParameters = [
  queryParameter(
    "keywords",
    "Keyword count. Must be an integer greater than or equal to 0.",
    { maximum: COST_ESTIMATE_MAX_KEYWORDS, minimum: 0, type: "integer" },
    true,
  ),
  queryParameter("depth", "Organic result depth per logical rank check.", {
    default: 100,
    enum: [10, 20, 50, 100],
    type: "integer",
  }),
  queryParameter("locations", "Location count per keyword.", {
    default: 1,
    maximum: COST_ESTIMATE_MAX_LOCATIONS,
    minimum: 1,
    type: "integer",
  }),
  queryParameter("devices", "Device count per keyword.", {
    default: 1,
    enum: [1, 2],
    type: "integer",
  }),
  queryParameter("frequency", "Rank-check frequency used to estimate monthly checks.", {
    default: "daily",
    enum: ["daily", "weekly", "monthly"],
    type: "string",
  }),
  queryParameter("provider", "Provider rate card to use.", {
    default: "dataforseo",
    enum: ["dataforseo", "serpapi"],
    type: "string",
  }),
  queryParameter("option", "Flat-rate provider option key.", {
    enum: ["standard", "priority", "live"],
    type: "string",
  }),
  queryParameter("plan", "Plan-model provider plan key; unknown values use auto selection.", {
    enum: ["free", "starter", "developer", "production", "bigdata"],
    type: "string",
  }),
];
