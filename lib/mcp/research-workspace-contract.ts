import { getMcpToolDefinitions } from "./definitions";

type InputSchema = {
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
};

export const researchWorkspaceToolNames = {
  getAiResearchCatalog: "get_ai_research_catalog",
  getProjectContext: "get_project_context",
  updateProjectContext: "update_project_context",
  listAgentReports: "list_agent_reports",
  createAgentReport: "create_agent_report",
  getAgentReport: "get_agent_report",
  analyzeAiVisibility: "analyze_ai_visibility",
  compareAiPrompts: "compare_ai_prompts",
  runSiteAudit: "run_site_audit",
  listSiteAudits: "list_site_audits",
  getSiteAudit: "get_site_audit",
} as const;

const definitions = getMcpToolDefinitions();

export const researchWorkspaceSchemas = Object.fromEntries(
  Object.entries(researchWorkspaceToolNames).map(([operationId, name]) => {
    const definition = definitions.find((tool) => tool.name === name);
    if (!definition) throw new Error(`Missing research tool schema: ${name}`);
    return [operationId, definition.inputSchema];
  }),
) as Record<keyof typeof researchWorkspaceToolNames, InputSchema>;
