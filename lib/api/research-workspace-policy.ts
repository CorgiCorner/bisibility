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
  analyzeBrandVisibility: policy(
    "POST",
    "/projects/{project_id}/brand-visibility",
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
  getSiteAuditRun: policy("GET", "/projects/{project_id}/site-audits/{report_id}/run", "read"),
  listSiteAuditPages: policy("GET", "/projects/{project_id}/site-audits/{report_id}/pages", "read"),
  cancelSiteAuditRun: policy(
    "POST",
    "/projects/{project_id}/site-audits/{report_id}/cancel",
    "write",
    "write",
    create,
  ),
  resumeSiteAuditRun: policy(
    "POST",
    "/projects/{project_id}/site-audits/{report_id}/resume",
    "write",
    "write",
    create,
  ),
} as const satisfies Record<string, OperationPolicy>;
