import { API_VERSION_HEADER } from "./api-versions";
import { analyticsPaths } from "./openapi-analytics";
import {
  accountAnalyticsConsentPaths,
  accountAnalyticsConsentSchema,
} from "./openapi-analytics-consent";
import { apiKeyPaths } from "./openapi-api-keys";
import { withAppOAuth } from "./openapi-app-oauth";
import { backlinksPaths, backlinksSchemas } from "./openapi-backlinks";
import { ref, schemas } from "./openapi-components";
import { reviewedDefaultsPaths } from "./openapi-defaults-review";
import { domainOverviewPaths, domainOverviewSchemas } from "./openapi-domain-overview";
import { keywordResearchPaths } from "./openapi-keyword-research";
import { keywordPaths } from "./openapi-keywords";
import { localMonitorResultPaths } from "./openapi-local-monitor-paths";
import { localMonitorResultSchemas } from "./openapi-local-monitor-results";
import { locationSearchPaths } from "./openapi-locations";
import { loopClosurePaths } from "./openapi-loop-closure";
import { migrationPaths, migrationSecuritySchemes } from "./openapi-migration";
import {
  idempotencyParameterComponents,
  keywordListParameters,
  pageParameterComponents,
  pageParameters,
  projectSelectionParameterComponents,
  rankCheckListParameters,
  signalListParameters,
  withProjectSelectionParameters,
} from "./openapi-parameters";
import * as personalAccess from "./openapi-pat";
import { withDeclaredPathParameters } from "./openapi-path-parameters";
import { problemResponse, problemResponses } from "./openapi-problem";
import { projectOverviewPaths } from "./openapi-project-overview";
import { publicPaths, publicSchemas } from "./openapi-public";
import { publicIdSchema } from "./openapi-public-id";
import { rankedKeywordSuggestionPaths } from "./openapi-ranked-keywords";
import { researchReportsPaths, researchReportsSchemas } from "./openapi-research-reports";
import { researchWorkspacePaths } from "./openapi-research-workspace";
import { resourcePaths } from "./openapi-resource-paths";
import { savedKeywordPaths } from "./openapi-saved-keywords";
import { savedViewOperations } from "./openapi-saved-views";
import { withSdkCost } from "./openapi-sdk-cost";
import { sdkName, withPublicIdExtensions } from "./openapi-sdk-schema";
import {
  sourceHeaderParameterComponents,
  withSourceHeaderParameter,
} from "./openapi-source-header";
import { createSignalOperation, runRankCheckOperation } from "./openapi-special-operations";
import { openApiTags, tagOpenApiPaths } from "./openapi-tags";
import { teamMutationPaths } from "./openapi-team-mutations";
import { aiTrackingPaths, aiTrackingSchemaComponents } from "./openapi-tracking";
import { aiTrackingComponentSchemas } from "./openapi-tracking-schemas";

const json = (schema: object) => ({ "application/json": { schema } });
const response = (schema: object, description = "JSON response") => ({
  content: json(schema),
  description,
});
/** A cursor page. Pages of a component are named `<Component>Page` for SDK generators. */
function list(schema: object) {
  const meta = {
    properties: { next_cursor: { type: ["string", "null"] } },
    required: ["next_cursor"],
    type: "object",
    ...sdkName("PageMeta"),
  };
  const item = "$ref" in schema ? String(schema.$ref).split("/").pop() : undefined;
  return {
    properties: {
      data: { items: schema, type: "array" },
      meta,
    },
    required: ["data", "meta"],
    type: "object",
    ...(item ? sdkName(`${item}Page`) : {}),
  };
}
function bearerOperation(
  summary: string,
  operationId: string,
  schema: object,
  requestSchema?: object,
  parameters?: object[],
) {
  return {
    operationId,
    ...(parameters ? { parameters } : {}),
    ...(requestSchema ? { requestBody: { content: json(requestSchema), required: false } } : {}),
    responses: { "200": response(schema), ...problemResponses },
    security: personalAccess.apiCredentialSecurity,
    summary,
  };
}

function createdBearerOperation(
  summary: string,
  operationId: string,
  schema: object,
  requestSchema: object,
  security = personalAccess.apiCredentialSecurity,
) {
  return {
    operationId,
    requestBody: { content: json(requestSchema), required: true },
    responses: { "201": response(schema, "Created"), ...problemResponses },
    security,
    summary,
  };
}

export function getOpenApiDocument() {
  return withAppOAuth(
    withSdkCost(
      withPublicIdExtensions({
        components: {
          parameters: {
            ...idempotencyParameterComponents,
            ...pageParameterComponents,
            ...projectSelectionParameterComponents,
            ...sourceHeaderParameterComponents,
          },
          schemas: {
            AccountAnalyticsConsent: accountAnalyticsConsentSchema,
            ...schemas,
            ...backlinksSchemas,
            ...domainOverviewSchemas,
            ...researchReportsSchemas,
            ...localMonitorResultSchemas,
            ...aiTrackingSchemaComponents(),
            ...aiTrackingComponentSchemas,
            ...publicSchemas,
          },
          securitySchemes: {
            ...personalAccess.apiCredentialSecuritySchemes,
            ...migrationSecuritySchemes,
          },
        },
        info: {
          description: `Public REST API for bisibility keyword rank tracking. Clients may optionally declare v1 with the ${API_VERSION_HEADER} header. Resource IDs use strict v3 prefixed public IDs and list cursors are version 3.`,
          title: "bisibility Public API",
          version: "1.0.0",
        },
        openapi: "3.1.0",
        paths: withSourceHeaderParameter(
          withProjectSelectionParameters(
            tagOpenApiPaths(
              withDeclaredPathParameters({
                ...accountAnalyticsConsentPaths,
                ...apiKeyPaths({
                  bearer: bearerOperation,
                  created: createdBearerOperation,
                  list,
                  ref: (name) => ref(name as keyof typeof schemas),
                }),
                ...personalAccess.personalAccessPaths({
                  bearer: bearerOperation,
                  created: createdBearerOperation,
                  list,
                  ref: (name) => ref(name as keyof typeof schemas),
                }),
                ...resourcePaths({
                  bearer: bearerOperation,
                  list,
                  ref: (name) => ref(name as keyof typeof schemas),
                }),
                ...publicPaths,
                ...researchWorkspacePaths(),
                ...aiTrackingPaths(),
                ...locationSearchPaths({ bearer: bearerOperation, ref }),
                ...keywordResearchPaths({ bearer: bearerOperation, ref }),
                ...loopClosurePaths({ bearer: bearerOperation, ref }),
                ...localMonitorResultPaths(bearerOperation),
                ...migrationPaths,
                "/keywords/{keyword_id}/checks": {
                  post: runRankCheckOperation({
                    problemResponses,
                    rankCheckRef: ref("RankCheck"),
                    rankCheckRunRef: ref("RankCheckRunQueued"),
                    security: personalAccess.apiCredentialSecurity,
                  }),
                },
                "/keywords/{keyword_id}/rank-checks": {
                  get: bearerOperation(
                    "List rank checks for a keyword",
                    "listRankChecks",
                    list(ref("RankCheck")),
                    undefined,
                    rankCheckListParameters,
                  ),
                },
                "/projects": {
                  get: bearerOperation(
                    "List projects visible to this API key",
                    "listProjects",
                    list(ref("Project")),
                    undefined,
                    pageParameters,
                  ),
                  post: createdBearerOperation(
                    "Create a project with a personal access token",
                    "createProject",
                    ref("Project"),
                    ref("ProjectCreate"),
                    personalAccess.personalAccessTokenSecurity,
                  ),
                },
                "/projects/{project_id}": {
                  delete: bearerOperation("Delete a project", "deleteProject", ref("Project")),
                  get: bearerOperation("Get one project", "getProject", ref("Project")),
                  patch: bearerOperation("Update a project", "updateProject", ref("Project")),
                },
                ...reviewedDefaultsPaths({
                  bearer: bearerOperation,
                  ref,
                  response,
                  problemResponse,
                  problemResponses,
                }),
                ...keywordPaths({
                  bearer: bearerOperation,
                  keywordListParameters,
                  list,
                  ref,
                }),
                ...projectOverviewPaths({ bearer: bearerOperation, ref }),
                ...rankedKeywordSuggestionPaths({ bearer: bearerOperation, ref }),
                ...analyticsPaths({ bearer: bearerOperation, ref }),
                ...backlinksPaths({ bearer: bearerOperation }),
                ...domainOverviewPaths({ bearer: bearerOperation }),
                ...researchReportsPaths({ bearer: bearerOperation }),
                ...savedKeywordPaths(list, bearerOperation, createdBearerOperation),
                "/projects/{project_id}/saved-views": savedViewOperations(
                  list,
                  bearerOperation,
                  createdBearerOperation,
                ),
                "/projects/{project_id}/signals": {
                  get: bearerOperation(
                    "List project signals",
                    "listSignals",
                    list(ref("Signal")),
                    undefined,
                    signalListParameters,
                  ),
                },
                ...teamMutationPaths({ bearer: bearerOperation, ref }),
                "/rank-checks/{check_id}": {
                  get: bearerOperation(
                    "Get one rank check",
                    "getRankCheckResult",
                    ref("RankCheck"),
                    undefined,
                    [
                      {
                        in: "path",
                        name: "check_id",
                        required: true,
                        schema: publicIdSchema("check"),
                      },
                    ],
                  ),
                },
                "/signals": {
                  post: createSignalOperation({
                    problemResponses,
                    security: personalAccess.apiCredentialSecurity,
                  }),
                },
              }),
            ),
          ),
        ),
        servers: [{ url: "/api/v1" }],
        tags: openApiTags,
      }),
    ),
  );
}
