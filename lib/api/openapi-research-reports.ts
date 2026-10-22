import { closedEnum } from "./openapi-sdk-schema";

export { researchReportsSchemas } from "./openapi-stored-report-components";

type Bearer = (
  summary: string,
  operationId: string,
  schema: object,
  requestSchema?: object,
  parameters?: object[],
) => object;

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

function queryParameter(name: string, description: string, schema: object) {
  return { description, in: "query", name, schema };
}

const reportParameters = [
  {
    description: "Report kind. The remaining query parameters are validated per kind.",
    in: "path",
    name: "kind",
    required: true,
    schema: {
      enum: ["backlinks", "domain_overview", "keyword_research"],
      type: "string",
      ...closedEnum("StoredReportKindInput"),
    },
  },
  queryParameter("target", "Stored target; required for backlinks and domain overviews.", {
    minLength: 1,
    type: "string",
  }),
  queryParameter("target_scope", "site or page for backlinks; root or subdomain for overviews.", {
    enum: ["page", "root", "site", "subdomain"],
    ...closedEnum("StoredReportTargetScopeInput"),
    type: "string",
  }),
  queryParameter("mode", "Backlinks row mode or keyword research mode as stored.", {
    enum: ["as_is", "auto", "ideas", "one_per_domain", "related", "suggestions"],
    ...closedEnum("StoredReportModeInput"),
    type: "string",
  }),
  queryParameter("include_subdomains", "Backlinks include-subdomains flag as stored.", {
    default: true,
    type: "boolean",
  }),
  queryParameter("seed", "Keyword research seed as stored. Required for keyword research.", {
    minLength: 1,
    maxLength: 80,
    type: "string",
  }),
  queryParameter("include_clickstream", "Keyword research clickstream flag as stored.", {
    default: false,
    type: "boolean",
  }),
  queryParameter("result_limit", "Keyword research result limit as stored.", {
    default: 100,
    ...closedEnum("StoredReportResultLimitInput"),
    enum: [100, 300, 500],
    type: "integer",
  }),
  queryParameter(
    "connection_id",
    "Provider connection public ID used when the report was stored.",
    { minLength: 1, maxLength: 120, pattern: "^conn_[a-z][a-z0-9]{23}$", type: "string" },
  ),
  queryParameter("language_code", "Domain overview language code as stored.", {
    minLength: 2,
    maxLength: 12,
    type: "string",
  }),
  queryParameter("location_code", "Domain overview location code as stored.", {
    minimum: 1,
    type: "integer",
  }),
];

const readDescription =
  "Read-only view of a report that is already stored. Reads never call a provider and never require a connected provider. A report is fresh while now is before fresh_until.";

export function researchReportsPaths(input: { bearer: Bearer }) {
  return {
    "/projects/{project_id}/research/reports": {
      get: {
        ...input.bearer(
          "List stored research reports",
          "listStoredResearchReports",
          ref("StoredResearchReportsResponse"),
        ),
        description: readDescription,
      },
    },
    "/projects/{project_id}/research/reports/{kind}": {
      get: {
        ...input.bearer(
          "Read a stored research report",
          "getStoredResearchReport",
          ref("StoredResearchReportResponse"),
          undefined,
          reportParameters,
        ),
        description: readDescription,
      },
    },
  };
}
