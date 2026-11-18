import { ASSISTANT_TOOL_POLICY, type AssistantCanonicalTool } from "./tool-policy";

export const ASSISTANT_TOOL_GROUPS = [
  "keywords",
  "rankings",
  "research",
  "backlinks",
  "alerts",
  "competitors",
  "ai_visibility",
  "site_audit",
  "indexing",
  "traffic",
  "reports",
  "saved_views",
] as const;
export type AssistantToolGroup = (typeof ASSISTANT_TOOL_GROUPS)[number];
const groups: Record<AssistantToolGroup, RegExp> = {
  keywords: /keyword/,
  rankings: /rank|sitemap_monitor/,
  research: /research|cost_estimate/,
  backlinks: /backlink|domain_overview/,
  alerts: /alert|signal/,
  competitors: /competitor/,
  ai_visibility: /prompt|brand_visibility|ai_research/,
  site_audit: /site_audit/,
  indexing: /index|sitemap/,
  traffic: /traffic|performance/,
  reports: /report|project_context/,
  saved_views: /saved_view|saved_keyword/,
};
const intent: Record<AssistantToolGroup, RegExp> = {
  keywords: /keyword|phrase|track|add/i,
  rankings: /rank|position|serp/i,
  research: /research|suggest|discover/i,
  backlinks: /backlink|domain|link/i,
  alerts: /alert|signal/i,
  competitors: /competitor|rival/i,
  ai_visibility: /prompt|ai visibility|brand visibility/i,
  site_audit: /audit|site health/i,
  indexing: /index|sitemap/i,
  traffic: /traffic|search console/i,
  reports: /report|summary|summarize|context/i,
  saved_views: /saved view|saved keyword/i,
};
export const SELECT_TOOL_GROUPS = {
  name: "select_tool_groups",
  title: "Select tool groups",
  description:
    "Request relevant tool groups for the next step; this does not execute project actions.",
  inputSchema: {
    type: "object",
    properties: {
      groups: {
        type: "array",
        items: { type: "string", enum: ASSISTANT_TOOL_GROUPS },
        maxItems: ASSISTANT_TOOL_GROUPS.length,
      },
    },
    required: ["groups"],
    additionalProperties: false,
  },
};

/** Limits both the number of schemas and the serialized input size without mutating schemas. */
export function discoverAssistantTools(
  text: string,
  pagePath: string,
  selected: readonly AssistantToolGroup[] = [],
  readOnly = false,
): (AssistantCanonicalTool | typeof SELECT_TOOL_GROUPS)[] {
  const active = new Set<AssistantToolGroup>(
    selected.filter((group) => ASSISTANT_TOOL_GROUPS.includes(group)),
  );
  const context = `${text.slice(0, 8000)} ${pagePath.slice(0, 300)}`;
  for (const group of ASSISTANT_TOOL_GROUPS) if (intent[group].test(context)) active.add(group);
  const core = ["get_project", "list_keywords"];
  const candidates = ASSISTANT_TOOL_POLICY.filter(
    ({ tool, category }) =>
      category !== "excluded" &&
      (!readOnly || category === "read") &&
      (core.includes(tool.name) || [...active].some((group) => groups[group].test(tool.name))),
  );
  candidates.sort(
    (a, b) => Number(core.includes(b.tool.name)) - Number(core.includes(a.tool.name)),
  );
  const result: (AssistantCanonicalTool | typeof SELECT_TOOL_GROUPS)[] = [SELECT_TOOL_GROUPS];
  let characters = JSON.stringify(SELECT_TOOL_GROUPS).length;
  for (const { tool } of candidates) {
    const size = JSON.stringify(tool).length;
    if (result.length >= 24) break;
    if (characters + size > 24000) continue;
    result.push(tool);
    characters += size;
  }
  return result;
}
