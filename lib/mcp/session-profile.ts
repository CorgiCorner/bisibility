import "server-only";

import { type ApiAuth, authenticateBearer } from "@/lib/api/auth";
import { type ApiScope, hasApiScope } from "@/lib/api/scope-policy";
import { getMcpToolDefinitions } from "./definitions";
import type { McpApiAuthorization } from "./rest-call";

// The hosted MCP registers the full catalog and has no toolset filter, so every
// canonical toolset is active for every session.
const ACTIVE_TOOLSETS = [
  "account",
  "ai-research",
  "ai-tracking",
  "agent-reports",
  "project-context",
  "site-audit",
  "alerts",
  "analytics",
  "backlinks",
  "checks",
  "competitors",
  "domain-overview",
  "keywords",
  "notifications",
  "projects",
  "providers",
  "rank-history",
  "saved-keywords",
  "saved-views",
  "signals",
  "sitemaps",
  "system",
  "team",
  "tokens",
  "webhooks",
] as const;

type SessionProfile = {
  canonical_names: string[];
  client_note: string;
  read_only: boolean;
  tool_count: number;
  tool_names: string[];
  toolsets: string[];
};

function authScopes(auth: ApiAuth): readonly ApiScope[] {
  return auth.kind === "personal_token" ? auth.token.scopes : auth.apiKey.scopes;
}

async function resolveSessionScopes(authorization: McpApiAuthorization) {
  if (typeof authorization !== "string") {
    return authScopes(authorization);
  }
  const request = new Request("https://mcp.local/api/v1/me", {
    headers: { authorization: `Bearer ${authorization}` },
  });
  return authScopes(await authenticateBearer(request));
}

export async function dispatchSessionProfile(authorization: McpApiAuthorization) {
  const scopes = await resolveSessionScopes(authorization);
  const definitions = getMcpToolDefinitions();
  const names = definitions.map((tool) => tool.name);
  const readOnlyCount = definitions.filter((tool) => tool.annotations.readOnlyHint).length;
  const profile: SessionProfile = {
    canonical_names: names,
    client_note: `Clients that hide tools without readOnlyHint (for example connectors without a developer or write mode) show ${readOnlyCount} of ${names.length} tools; a missing write tool is a client setting, not a token limit.`,
    read_only: !hasApiScope(scopes, "write"),
    tool_count: names.length,
    tool_names: names,
    toolsets: [...ACTIVE_TOOLSETS],
  };

  return { ok: true, payload: profile, status: 200 };
}
