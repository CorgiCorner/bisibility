import "server-only";

import { dispatchAgentToolRoute } from "./agent-tool-routes";
import { internalMcpToolName } from "./canonical-tools";
import { dispatchExtendedToolRoute } from "./extended-tool-routes";
import { dispatchKeywordResearchTool } from "./keyword-research-tools";
import { dispatchLoopClosureTool } from "./loop-closure-tools";
import { validateMcpPublicIds } from "./public-id-input";
import { dispatchMcpRestCall, type RestCall } from "./rest-call";
import type { JsonObject } from "./types";

type ToolArgs = JsonObject;
type RestMethod = RestCall["method"];

function requiredString(input: ToolArgs, key: string) {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required.`);
  }
  return value;
}

function serializeQueryValue(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "function") return value.name;
  if (typeof value === "symbol") return value.description ?? "";
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return value.toString(10);
  if (typeof value === "bigint") return value.toString(10);
  return "";
}

function query(input: ToolArgs, keys: string[]) {
  const params = new URLSearchParams();
  for (const key of keys) {
    const serialized = serializeQueryValue(input[key]);
    if (serialized !== null) params.set(key, serialized);
  }
  return params.size ? `?${params}` : "";
}

function body(input: ToolArgs, omit: string[]) {
  const skipped = new Set([...omit, "idempotency_key", "project_id"]);
  return Object.fromEntries(Object.entries(input).filter(([key]) => !skipped.has(key)));
}

function addKeywordsBody(input: ToolArgs) {
  const defaults = body(input, ["project_id", "keywords"]);
  const keywords = Array.isArray(input.keywords) ? input.keywords : [];

  return {
    keywords: keywords.map((item) =>
      typeof item === "string"
        ? { ...defaults, keyword: item }
        : { ...defaults, ...(item as JsonObject) },
    ),
  };
}

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

function projectPath(input: ToolArgs, resource = "") {
  const base = `/projects/${encodeURIComponent(requiredString(input, "project_id"))}`;
  return resource ? `${base}/${resource}` : base;
}

function dispatchToRest(name: string, input: ToolArgs): RestCall {
  validateMcpPublicIds(name, input);
  // biome-ignore format: compact dispatch keeps this registry under the file line cap.
  const directRoute = dispatchAgentToolRoute(name, input) ?? dispatchKeywordResearchTool(name, input);
  const extendedRoute = dispatchExtendedToolRoute(name, input);
  if (extendedRoute) return extendedRoute;
  if (directRoute) return directRoute;
  const keyword = () => encodeURIComponent(requiredString(input, "keyword_id"));
  const project = (resource: string) => projectPath(input, resource);
  const page = () => query(input, ["cursor", "limit"]);
  const rankPage = () => query(input, ["cursor", "limit", "since", "status", "until"]);
  const keywordList = () =>
    query(input, [
      "cursor",
      "limit",
      "country",
      "device",
      "position_gt",
      "position_lt",
      "search",
      "sort",
      "tag",
    ]);

  switch (name) {
    case "getHealth":
      return call("/health", "GET");
    case "getCapabilities":
      return call("/capabilities", "GET");
    case "getMe":
      return call("/me", "GET");
    case "updateMe":
      return call("/me", "PATCH", input, body(input, []));
    case "listProjects":
      return call(`/projects${page()}`, "GET");
    case "createProject":
      return call("/projects", "POST", input, body(input, []));
    case "getProject":
      return call(projectPath(input), "GET");
    case "updateProjectDefaults":
      return call(project("defaults"), "PATCH", input, body(input, ["project_id"]));
    case "listKeywords":
      return call(`${project("keywords")}${keywordList()}`, "GET");
    case "addKeywords":
      return call(project("keywords"), "POST", input, addKeywordsBody(input));
    case "getKeyword":
      return call(`/keywords/${keyword()}`, "GET", input);
    case "updateKeyword":
      return call(`/keywords/${keyword()}`, "PATCH", input, body(input, ["keyword_id"]));
    case "setKeywordTargetUrl":
      return call(`/keywords/${keyword()}`, "PATCH", input, {
        target_url: input.target_url ?? null,
      });
    case "deleteKeyword":
      return call(`/keywords/${keyword()}`, "DELETE", input);
    case "bulkUpdateKeywords":
      return call("/keywords/bulk", "POST", input, body(input, []));
    case "runRankCheck":
      return call(
        `/keywords/${keyword()}/checks`,
        "POST",
        input,
        body(input, ["async", "keyword_id"]),
      );
    case "getRankHistory":
      return call(`/keywords/${keyword()}/rank-checks${rankPage()}`, "GET", input);
    case "getRankCheckResult":
      return call(
        `/rank-checks/${encodeURIComponent(requiredString(input, "check_id"))}`,
        "GET",
        input,
      );
    case "listApiKeys":
      // Personal tokens pass project_id (nested route); project keys are
      // already scoped and use the top-level alias.
      return input.project_id
        ? call(`${projectPath(input, "api-keys")}${page()}`, "GET")
        : call(`/api-keys${page()}`, "GET");
    case "createApiKey":
      return input.project_id
        ? call(projectPath(input, "api-keys"), "POST", input, body(input, ["project_id"]))
        : call("/api-keys", "POST", input, body(input, []));
    case "revokeApiKey":
      return call(
        `/api-keys/${encodeURIComponent(requiredString(input, "key_id"))}`,
        "DELETE",
        input,
      );
    case "listPersonalTokens":
      return call("/me/tokens", "GET");
    case "createPersonalToken":
      return call("/me/tokens", "POST", input, body(input, []));
    case "revokePersonalToken":
      return call(
        `/me/tokens/${encodeURIComponent(requiredString(input, "token_id"))}`,
        "DELETE",
        input,
      );
    default:
      return dispatchProjectTool(name, input, page());
  }
}

function memberPath(input: ToolArgs, resource: string, idKey: string, action = "") {
  return `${projectPath(input, resource)}/${encodeURIComponent(requiredString(input, idKey))}${action}`;
}

function dispatchProjectTool(name: string, input: ToolArgs, page: string): RestCall {
  const loopClosure = dispatchLoopClosureTool(name, input);
  if (loopClosure) return loopClosure;
  const project = (resource: string) => projectPath(input, resource);
  const member = (resource: string, idKey: string, action = "") =>
    memberPath(input, resource, idKey, action);

  switch (name) {
    case "listAlertRules":
      return call(`${project("alert-rules")}${page}`, "GET");
    case "createAlertRule":
      return call(project("alert-rules"), "POST", input, body(input, ["project_id"]));
    case "updateAlertRule":
      return call(
        `/alert-rules/${encodeURIComponent(requiredString(input, "rule_id"))}`,
        "PATCH",
        input,
        body(input, ["rule_id", "project_id"]),
      );
    case "deleteAlertRule":
      return call(
        `/alert-rules/${encodeURIComponent(requiredString(input, "rule_id"))}`,
        "DELETE",
        input,
      );
    case "listTriggeredAlerts":
      return call(`${project("triggered-alerts")}${page}`, "GET");
    case "listTeamMembers":
      return call(`${project("team/members")}${page}`, "GET");
    case "listTeamInvites":
      return call(`${project("team/invites")}${page}`, "GET");
    case "createTeamInvite":
      return call(project("team/invites"), "POST", input, body(input, ["project_id"]));
    case "revokeTeamInvite":
      return call(member("team/invites", "invite_id"), "DELETE", input);
    case "listProviders":
      return call(`${project("providers")}${page}`, "GET");
    case "connectProvider":
      return call(
        member("providers", "provider_id", "/connect"),
        "POST",
        input,
        body(input, ["project_id", "provider_id"]),
      );
    case "testProviderConnection":
      return call(
        member("providers", "provider_id", "/test"),
        "POST",
        input,
        body(input, ["project_id", "provider_id"]),
      );
    case "updateProviderSettings":
      return call(
        member("providers", "provider_id"),
        "PATCH",
        input,
        body(input, ["project_id", "provider_id"]),
      );
    case "disconnectProvider":
      return call(member("providers", "provider_id"), "DELETE", input);
    case "listSavedViews":
      return call(
        `${project("saved-views")}${query(input, ["cursor", "limit", "surface"])}`,
        "GET",
      );
    case "createSavedView":
      return call(project("saved-views"), "POST", input, body(input, ["project_id"]));
    case "deleteSavedView":
      return call(member("saved-views", "view_id"), "DELETE", input);
    case "listCompetitors":
      return call(`${project("competitors")}${page}`, "GET");
    case "addCompetitor":
      return call(project("competitors"), "POST", input, body(input, ["project_id"]));
    case "removeCompetitor":
      return call(member("competitors", "competitor_id"), "DELETE", input);
    case "getNotificationPreferences":
      return call(project("notification-preferences"), "GET");
    case "updateNotificationPreferences":
      return call(project("notification-preferences"), "PATCH", input, body(input, ["project_id"]));
    case "listMigrationTokens":
      return call(`${project("migration-tokens")}${page}`, "GET");
    case "mintMigrationToken":
      return call(project("migration-tokens"), "POST", input, body(input, ["project_id"]));
    case "revokeMigrationToken":
      return call(member("migration-tokens", "token_id"), "DELETE", input);
    case "listWebhooks":
      return call(`${project("webhooks")}${page}`, "GET");
    case "createWebhook":
      return call(project("webhooks"), "POST", input, body(input, ["project_id"]));
    case "updateWebhook":
      return call(
        member("webhooks", "webhook_id"),
        "PATCH",
        input,
        body(input, ["project_id", "webhook_id"]),
      );
    case "deleteWebhook":
      return call(member("webhooks", "webhook_id"), "DELETE", input);
    default:
      throw new Error(`Unknown MCP tool: ${name}`);
  }
}

export async function dispatchMcpTool(name: string, input: ToolArgs, apiKey: string) {
  return dispatchMcpRestCall(dispatchToRest(internalMcpToolName(name), input), apiKey);
}
