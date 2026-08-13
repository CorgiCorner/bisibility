import { API_VERSION_HEADER } from "./api-versions";
import { analyticsPaths } from "./openapi-analytics";
import { apiKeyPaths } from "./openapi-api-keys";
import { backlinksPaths, backlinksSchemas } from "./openapi-backlinks";
import { ref, schemas } from "./openapi-components";
import { domainOverviewPaths, domainOverviewSchemas } from "./openapi-domain-overview";
import { keywordResearchPaths } from "./openapi-keyword-research";
import { keywordPaths } from "./openapi-keywords";
import { locationSearchPaths } from "./openapi-locations";
import { loopClosurePaths } from "./openapi-loop-closure";
import { migrationPaths, migrationSecuritySchemes } from "./openapi-migration";
import {
  asyncParameter,
  keywordListParameters,
  rankCheckListParameters,
  signalListParameters,
} from "./openapi-parameters";
import * as personalAccess from "./openapi-pat";
import { projectOverviewPaths } from "./openapi-project-overview";
import { publicPaths } from "./openapi-public";
import { rankedKeywordSuggestionPaths } from "./openapi-ranked-keywords";
import { savedKeywordPaths } from "./openapi-saved-keywords";
import { savedViewOperations } from "./openapi-saved-views";
import { createSignalOperation, runRankCheckOperation } from "./openapi-special-operations";
import { openApiTags, tagOpenApiPaths } from "./openapi-tags";
import { teamMutationPaths } from "./openapi-team-mutations";

const json = (schema: object) => ({ "application/json": { schema } });
const response = (schema: object, description = "JSON response") => ({
  content: json(schema),
  description,
});
function list(schema: object) {
  const meta = {
    properties: { next_cursor: { type: ["string", "null"] } },
    required: ["next_cursor"],
    type: "object",
  };
  return {
    properties: {
      data: { items: schema, type: "array" },
      meta,
    },
    required: ["data", "meta"],
    type: "object",
  };
}
const obj = { type: "object" };
const problemResponses = {
  "400": response(ref("Problem"), "Bad request"),
  "401": response(ref("Problem"), "Unauthorized"),
  "403": response(ref("Problem"), "Forbidden"),
  "404": response(ref("Problem"), "Not found"),
  "429": response(ref("Problem"), "Rate limited"),
};
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
  return {
    components: {
      schemas: { ...schemas, ...backlinksSchemas, ...domainOverviewSchemas },
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
    paths: tagOpenApiPaths({
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
      "/alert-rules/{rule_id}": {
        delete: bearerOperation("Delete an alert rule", "deleteAlertRule", obj),
        patch: bearerOperation(
          "Update an alert rule",
          "updateAlertRule",
          obj,
          ref("AlertRuleInput"),
        ),
      },
      ...publicPaths,
      ...locationSearchPaths({ bearer: bearerOperation, ref }),
      ...keywordResearchPaths({ bearer: bearerOperation, ref }),
      ...loopClosurePaths({ bearer: bearerOperation, ref }),
      "/competitors/{competitor_id}": {
        delete: bearerOperation("Remove a competitor", "removeCompetitor", obj),
      },
      ...migrationPaths,
      "/keywords/{id}/checks": {
        post: runRankCheckOperation({
          asyncParameter,
          problemResponses,
          rankCheckRef: ref("RankCheck"),
          security: personalAccess.apiCredentialSecurity,
        }),
      },
      "/keywords/{id}/rank-checks": {
        get: bearerOperation(
          "List rank checks for a keyword",
          "listRankChecks",
          list(ref("RankCheck")),
          undefined,
          rankCheckListParameters,
        ),
      },
      "/migration-tokens/{token_id}": {
        delete: bearerOperation("Revoke a migration token", "revokeMigrationToken", obj),
      },
      "/projects": {
        get: bearerOperation(
          "List projects visible to this API key",
          "listProjects",
          list(ref("Project")),
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
      "/projects/{project_id}/defaults": {
        get: bearerOperation("Get project defaults", "getProjectDefaults", ref("ProjectDefaults")),
        patch: bearerOperation(
          "Update project defaults",
          "updateProjectDefaults",
          ref("ProjectDefaults"),
          ref("ProjectDefaultsPatch"),
        ),
      },
      ...keywordPaths({
        bearer: bearerOperation,
        keywordListParameters,
        list,
        ref,
      }),
      ...projectOverviewPaths({ bearer: bearerOperation, ref }),
      ...rankedKeywordSuggestionPaths({ bearer: bearerOperation, ref }),
      "/projects/{project_id}/alert-rules": {
        get: bearerOperation("List alert rules", "listAlertRules", list(obj)),
        post: bearerOperation(
          "Create an alert rule",
          "createAlertRule",
          obj,
          ref("AlertRuleInput"),
        ),
      },
      ...analyticsPaths({ bearer: bearerOperation, ref }),
      ...backlinksPaths({ bearer: bearerOperation }),
      ...domainOverviewPaths({ bearer: bearerOperation }),
      "/projects/{project_id}/competitors": {
        get: bearerOperation("List competitors", "listCompetitors", list(obj)),
        post: bearerOperation("Add a competitor", "addCompetitor", obj),
      },
      "/projects/{project_id}/competitors/{competitor_id}": {
        delete: bearerOperation("Remove a competitor", "removeProjectCompetitor", obj),
      },
      "/projects/{project_id}/migration-tokens": {
        get: bearerOperation("List migration tokens", "listMigrationTokens", list({})),
        post: bearerOperation("Mint a migration token", "mintMigrationToken", obj),
      },
      "/projects/{project_id}/migration-tokens/{token_id}": {
        delete: bearerOperation("Revoke a migration token", "revokeProjectMigrationToken", obj),
      },
      "/projects/{project_id}/notification-preferences": {
        get: bearerOperation("Get notification preferences", "getNotificationPreferences", obj),
        patch: bearerOperation(
          "Update notification preferences",
          "updateNotificationPreferences",
          obj,
        ),
      },
      "/projects/{project_id}/providers": {
        get: bearerOperation("List providers", "listProviders", list(ref("Provider"))),
      },
      "/projects/{project_id}/providers/{provider_id}": {
        delete: bearerOperation("Disconnect a provider", "disconnectProvider", obj),
        patch: bearerOperation("Update provider settings", "updateProviderSettings", obj),
      },
      "/projects/{project_id}/providers/{provider_id}/connect": {
        post: bearerOperation("Connect a provider", "connectProvider", obj),
      },
      "/projects/{project_id}/providers/{provider_id}/test": {
        post: bearerOperation("Test a provider connection", "testProviderConnection", obj),
      },
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
      "/projects/{project_id}/saved-views/{view_id}": {
        delete: bearerOperation("Delete a saved view", "deleteProjectSavedView", obj),
      },
      "/projects/{project_id}/team/invites": {
        get: bearerOperation("List team invites", "listTeamInvites", list(obj)),
        post: bearerOperation("Create a team invite", "createTeamInvite", obj),
      },
      "/projects/{project_id}/team/invites/{invite_id}": {
        delete: bearerOperation("Revoke a team invite", "revokeProjectTeamInvite", obj),
      },
      ...teamMutationPaths({ bearer: bearerOperation, ref }),
      "/projects/{project_id}/team/members": {
        get: bearerOperation("List team members", "listTeamMembers", list(obj)),
      },
      "/projects/{project_id}/triggered-alerts": {
        get: bearerOperation("List triggered alerts", "listTriggeredAlerts", list({})),
      },
      "/rank-checks/{check_id}": {
        get: bearerOperation("Get one rank check", "getRankCheckResult", ref("RankCheck")),
      },
      "/saved-views/{view_id}": {
        delete: bearerOperation("Delete a saved view", "deleteSavedView", obj),
      },
      "/signals": {
        post: createSignalOperation({
          problemResponses,
          security: personalAccess.apiCredentialSecurity,
        }),
      },
      "/team/invites/{invite_id}": {
        delete: bearerOperation("Revoke a team invite", "revokeTeamInvite", obj),
      },
    }),
    servers: [{ url: "/api/v1" }],
    tags: openApiTags,
  };
}
