import canonicalTools from "@/lib/mcp/canonical-contract.json";
import { PHASE_C_PENDING_TOOL_NAMES } from "@/lib/mcp/canonical-tools";
import type { ToolCategory } from "./wire";

/** These routes are outside the assistant's project-scoped, native-session authority. */
export const EXCLUDED_ASSISTANT_TOOLS = [
  "get_session_profile",
  "get_health",
  "get_capabilities",
  "get_cloud_import_compatibility",
  "get_provider_rates",
  "get_me",
  "update_me",
  "list_projects",
  "create_project",
  "update_project",
  "delete_project",
  "search_locations",
  "list_local_monitor_runs",
  "get_local_monitor_run_results",
  "list_local_monitor_point_listings",
  "list_local_monitor_point_history",
  "export_local_monitor_run",
  "list_api_keys",
  "create_api_key",
  "revoke_api_key",
  "list_project_api_keys",
  "create_project_api_key",
  "list_personal_tokens",
  "create_personal_token",
  "revoke_personal_token",
  "list_webhooks",
  "create_webhook",
  "update_webhook",
  "delete_webhook",
  "list_team_members",
  "list_team_invites",
  "create_team_invite",
  "revoke_team_invite",
  "resend_team_invite",
  "update_team_member_role",
  "remove_team_member",
  "list_providers",
  "connect_provider",
  "test_provider_connection",
  "update_provider_settings",
  "set_provider_enabled",
  "set_provider_priority",
  "set_primary_provider",
  "disconnect_provider",
  "get_notification_preferences",
  "update_notification_preferences",
  "list_migration_tokens",
  "mint_migration_token",
  "revoke_migration_token",
  ...PHASE_C_PENDING_TOOL_NAMES,
  // Paid operations whose canonical schema takes no cost ceiling cannot bind an approved maximum.
  "run_site_audit",
  "create_prompt_tracker_run",
  "retry_prompt_tracker_run",
  "prompt_research_suggestions_generate",
  // Deprecated AI schedule writes skip the app's recurring payment review, so the assistant never
  // proposes them.
  "create_prompt_tracker_schedule",
  "update_prompt_tracker_schedule",
] as const;
const excluded = new Set<string>(EXCLUDED_ASSISTANT_TOOLS);
const paid = new Set([
  "list_ranked_keyword_suggestions",
  "research_keywords",
  "analyze_backlinks",
  "load_more_backlink_rows",
  "analyze_domain_overview",
  "load_domain_overview_history",
  "load_domain_overview_keywords",
  "load_domain_overview_pages",
  "get_keyword_metrics",
  "run_rank_check",
  "analyze_brand_visibility",
  "compare_ai_prompts",
  "run_site_audit",
  "create_prompt_tracker_run",
  "retry_prompt_tracker_run",
  "prompt_research_suggestions_generate",
]);

export type AssistantCanonicalTool = (typeof canonicalTools)[number];
export function assistantToolCategory(tool: AssistantCanonicalTool): ToolCategory {
  if (excluded.has(tool.name)) return "excluded";
  if (paid.has(tool.name)) return "paid";
  if (tool.annotations.destructiveHint || tool.name.startsWith("bulk_")) return "destructive";
  if (tool.annotations.readOnlyHint) return "read";
  const schema = JSON.stringify(tool.inputSchema);
  if (schema.includes('"max_cost_cents"') || schema.includes('"cost_policy"')) return "paid";
  return "mutation";
}
export const ASSISTANT_TOOL_POLICY = canonicalTools.map((tool) => ({
  tool,
  category: assistantToolCategory(tool),
}));
/** Only operations whose canonical schema takes a ceiling can bind an approved maximum cost. */
export function assistantToolHasCostCeiling(tool: AssistantCanonicalTool) {
  const properties = (tool.inputSchema as { properties?: Record<string, unknown> }).properties;
  return Boolean(properties && "max_cost_cents" in properties);
}
export function findAssistantTool(name: string) {
  return ASSISTANT_TOOL_POLICY.find((entry) => entry.tool.name === name);
}
