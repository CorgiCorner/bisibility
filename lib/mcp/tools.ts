import "server-only";
import type { ApiOperationId } from "@/lib/api/operation-policy";
import { dispatchAgentToolRoute } from "./agent-tool-routes";
import { dispatchPromptTrackerTool } from "./ai-tracking-tools";
import { internalMcpToolName } from "./canonical-tools";
import { dispatchDomainVerification } from "./domain-verification-tools";
import { dispatchExtendedToolRoute, providerSettingsBody } from "./extended-tool-routes";
import { dispatchKeywordResearchTool } from "./keyword-research-tools";
import { dispatchLocalMonitorTool } from "./local-monitor-tools";
import { dispatchLoopClosureTool } from "./loop-closure-tools";
import { operationPath } from "./operation-path";
import { validateMcpPublicIds } from "./public-id-input";
import { dispatchRankRunTool } from "./rank-run-tools";
import { dispatchResearchWorkspaceTool } from "./research-workspace-tools";
import { dispatchMcpRestCall, type McpApiAuthorization, type RestCall } from "./rest-call";
import { dispatchSessionProfile } from "./session-profile";
import { addKeywordsBody, body, query } from "./tool-arguments";
import type { JsonObject } from "./types";

type ToolArgs = JsonObject;
type RestMethod = RestCall["method"];

function call(
  path: string,
  method: RestMethod,
  input: ToolArgs = {},
  bodyInput?: unknown,
): RestCall {
  return {
    body: bodyInput,
    idempotencyKey: input.idempotency_key as string | undefined,
    method,
    path,
    preferAsync: input.async === true,
    projectId: typeof input.project_id === "string" ? input.project_id : undefined,
  };
}

function dispatchToRest(name: string, input: ToolArgs): RestCall {
  validateMcpPublicIds(name, input);
  const domainRoute = dispatchDomainVerification(name, input);
  if (domainRoute) return domainRoute;
  const rankRunRoute = dispatchRankRunTool(name, input);
  if (rankRunRoute) return rankRunRoute;
  const localRoute = dispatchLocalMonitorTool(name, input);
  if (localRoute) return localRoute;
  const trackingRoute = dispatchPromptTrackerTool(name, input);
  if (trackingRoute) return trackingRoute;
  // biome-ignore format: compact dispatch keeps this registry under the file line cap.
  const directRoute = dispatchAgentToolRoute(name, input) ?? dispatchKeywordResearchTool(name, input);
  const researchRoute = dispatchResearchWorkspaceTool(name, input);
  if (researchRoute) return researchRoute;
  const extendedRoute = dispatchExtendedToolRoute(name, input);
  if (extendedRoute) return extendedRoute;
  if (directRoute) return directRoute;
  const path = (operation: ApiOperationId) => operationPath(operation, input);
  const page = () => query(input, ["cursor", "limit"]);
  const rankPage = () => query(input, ["cursor", "limit", "since", "status", "until"]);
  const keywordList = () =>
    query(input, [
      "cursor",
      "limit",
      "country",
      "device",
      "intent",
      "location_key",
      "position_gt",
      "position_lt",
      "search",
      "sort",
      "tag",
      "topic",
    ]);

  switch (name) {
    case "getSearchPerformanceTotals":
      return call(
        `${path("getSearchPerformanceTotals")}${query(input, ["start_date", "end_date", "compare_previous"])}`,
        "GET",
        input,
      );
    case "getHealth":
      return call("/health", "GET");
    case "getCapabilities":
      return call("/capabilities", "GET");
    case "getMe":
      return call(path("getMe"), "GET");
    case "updateMe":
      return call(path("updateMe"), "PATCH", input, body(input, []));
    case "listProjects":
      return call(`${path("listProjects")}${page()}`, "GET");
    case "createProject":
      return call(path("createProject"), "POST", input, body(input, []));
    case "getProject":
      return call(path("getProject"), "GET");
    case "listKeywords":
      return call(`${path("listKeywords")}${keywordList()}`, "GET");
    case "addKeywords":
      return call(path("addKeywords"), "POST", input, addKeywordsBody(input));
    case "getKeyword":
      return call(path("getKeyword"), "GET", input);
    case "updateKeyword":
      return call(path("setKeywordTargetUrl"), "PATCH", input, body(input, ["keyword_id"]));
    case "setKeywordTargetUrl":
      return call(path("setKeywordTargetUrl"), "PATCH", input, {
        target_url: input.target_url ?? null,
      });
    case "deleteKeyword":
      return call(path("deleteKeyword"), "DELETE", input);
    case "bulkUpdateKeywords":
      return call(path("bulkUpdateKeywords"), "POST", input, body(input, []));
    case "runRankCheck":
      return call(path("runRankCheck"), "POST", input, body(input, ["async", "keyword_id"]));
    case "getRankHistory":
      return call(`${path("listRankChecks")}${rankPage()}`, "GET", input);
    case "getRankCheckResult":
      return call(path("getRankCheckResult"), "GET", input);
    case "listApiKeys":
      // Personal tokens pass project_id (nested route); project keys are
      // already scoped and use the top-level alias.
      return input.project_id
        ? call(`${path("listProjectApiKeys")}${page()}`, "GET")
        : call(`${path("listApiKeys")}${page()}`, "GET");
    case "createApiKey":
      return input.project_id
        ? call(path("createProjectApiKey"), "POST", input, body(input, ["project_id"]))
        : call(path("createApiKey"), "POST", input, body(input, []));
    case "revokeApiKey":
      return call(path("revokeApiKey"), "DELETE", input);
    case "listPersonalTokens":
      return call(path("listPersonalAccessTokens"), "GET");
    case "createPersonalToken":
      return call(path("createPersonalAccessToken"), "POST", input, body(input, []));
    case "revokePersonalToken":
      return call(path("revokePersonalAccessToken"), "DELETE", input);
    default:
      return dispatchProjectTool(name, input, page());
  }
}

function dispatchProjectTool(name: string, input: ToolArgs, page: string): RestCall {
  const loopClosure = dispatchLoopClosureTool(name, input);
  if (loopClosure) return loopClosure;
  const path = (operation: ApiOperationId) => operationPath(operation, input);

  switch (name) {
    case "listAlertRules":
      return call(`${path("listAlertRules")}${page}`, "GET");
    case "createAlertRule":
      return call(path("createAlertRule"), "POST", input, body(input, ["project_id"]));
    case "updateAlertRule":
      return call(path("updateAlertRule"), "PATCH", input, body(input, ["rule_id", "project_id"]));
    case "deleteAlertRule":
      return call(path("deleteAlertRule"), "DELETE", input);
    case "listTriggeredAlerts":
      return call(`${path("listTriggeredAlerts")}${page}`, "GET");
    case "listTeamMembers":
      return call(`${path("listTeamMembers")}${page}`, "GET");
    case "listTeamInvites":
      return call(`${path("listTeamInvites")}${page}`, "GET");
    case "createTeamInvite":
      return call(path("createTeamInvite"), "POST", input, body(input, ["project_id"]));
    case "revokeTeamInvite":
      return call(path("revokeProjectTeamInvite"), "DELETE", input);
    case "listProviders":
      return call(`${path("listProviders")}${page}`, "GET");
    case "connectProvider":
      return call(path("connectProvider"), "POST", input, providerSettingsBody(input));
    case "testProviderConnection":
      return call(
        path("testProviderConnection"),
        "POST",
        input,
        body(input, ["project_id", "provider_id"]),
      );
    case "updateProviderSettings":
      return call(path("updateProviderSettings"), "PATCH", input, providerSettingsBody(input));
    case "disconnectProvider":
      return call(path("disconnectProvider"), "DELETE", input);
    case "listSavedKeywords":
      return call(`${path("listSavedKeywords")}${page}`, "GET");
    case "createSavedKeywords":
      return call(path("createSavedKeywords"), "POST", input, body(input, ["project_id"]));
    case "deleteSavedKeyword":
      return call(path("deleteProjectSavedKeyword"), "DELETE", input);
    case "listSavedViews":
      return call(
        `${path("listSavedViews")}${query(input, ["cursor", "limit", "surface"])}`,
        "GET",
      );
    case "createSavedView":
      return call(path("createSavedView"), "POST", input, body(input, ["project_id"]));
    case "deleteSavedView":
      return call(path("deleteProjectSavedView"), "DELETE", input);
    case "listCompetitors":
      return call(`${path("listCompetitors")}${page}`, "GET");
    case "addCompetitor":
      return call(path("addCompetitor"), "POST", input, body(input, ["project_id"]));
    case "removeCompetitor":
      return call(path("removeProjectCompetitor"), "DELETE", input);
    case "getNotificationPreferences":
      return call(path("getNotificationPreferences"), "GET");
    case "updateNotificationPreferences":
      return call(
        path("updateNotificationPreferences"),
        "PATCH",
        input,
        body(input, ["project_id"]),
      );
    case "listMigrationTokens":
      return call(`${path("listMigrationTokens")}${page}`, "GET");
    case "mintMigrationToken":
      return call(path("mintMigrationToken"), "POST", input, body(input, ["project_id"]));
    case "revokeMigrationToken":
      return call(path("revokeProjectMigrationToken"), "DELETE", input);
    case "listWebhooks":
      return call(`${path("listWebhookEndpoints")}${page}`, "GET");
    case "createWebhook":
      return call(path("createWebhookEndpoint"), "POST", input, body(input, ["project_id"]));
    case "updateWebhook":
      return call(
        path("updateWebhookEndpoint"),
        "PATCH",
        input,
        body(input, ["project_id", "webhook_id"]),
      );
    case "deleteWebhook":
      return call(path("deleteWebhookEndpoint"), "DELETE", input);
    default:
      throw new Error(`Unknown MCP tool: ${name}`);
  }
}

export async function dispatchMcpTool(
  name: string,
  input: ToolArgs,
  authorization: McpApiAuthorization,
  clientHeader?: string,
) {
  const internalName = internalMcpToolName(name);
  if (internalName === "getSessionProfile") {
    return dispatchSessionProfile(authorization);
  }
  return dispatchMcpRestCall(dispatchToRest(internalName, input), authorization, clientHeader);
}
