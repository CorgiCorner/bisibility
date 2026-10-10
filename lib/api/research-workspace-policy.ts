import { type OperationPolicy, policy } from "./operation-policy-helpers";

const create = { action: "create", resourceType: "project" } as const;
const update = { action: "update", resourceType: "project" } as const;

export const researchWorkspaceOperationPolicy = {
  getAiResearchCatalog: policy("GET", "/projects/{project_id}/ai-catalog", "read"),
  getProjectContext: policy("GET", "/projects/{project_id}/context", "read"),
  updateProjectContext: policy("PATCH", "/projects/{project_id}/context", "write", "write", update),
  listAgentReports: policy("GET", "/projects/{project_id}/agent-reports", "read"),
  createAgentReport: policy(
    "POST",
    "/projects/{project_id}/agent-reports",
    "write",
    "write",
    create,
  ),
  getAgentReport: policy("GET", "/projects/{project_id}/agent-reports/{report_id}", "read"),
  analyzeAiVisibility: policy(
    "POST",
    "/projects/{project_id}/ai-visibility",
    "write",
    "write",
    create,
  ),
  compareAiPrompts: policy(
    "POST",
    "/projects/{project_id}/prompt-explorer",
    "write",
    "write",
    create,
  ),
  runSiteAudit: policy("POST", "/projects/{project_id}/site-audits", "write", "write", create),
  listSiteAudits: policy("GET", "/projects/{project_id}/site-audits", "read"),
  getSiteAudit: policy("GET", "/projects/{project_id}/site-audits/{report_id}", "read"),
} as const satisfies Record<string, OperationPolicy>;
