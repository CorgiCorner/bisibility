type OperationPresentation = {
  description?: string;
  summary: string;
};

export const openApiOperationPresentation: Record<string, OperationPresentation> = {
  analyzeBacklinks: { summary: "Analyze backlinks" },
  createApiKey: {
    description: "The scope defaults to admin when omitted.",
    summary: "Create an API key",
  },
  createPersonalAccessToken: {
    description: "Creates a personal access token or exchanges a supported OAuth credential.",
    summary: "Create a personal access token",
  },
  createProject: {
    description: "Requires a personal access token with permission to create projects.",
    summary: "Create a project",
  },
  createProjectApiKey: {
    description: "The scope defaults to admin when omitted.",
    summary: "Create a project API key",
  },
  deleteProjectSavedView: { summary: "Delete a project saved view" },
  deleteSavedView: { summary: "Delete a saved view by ID" },
  exportRankHistory: {
    description: "Returns paginated JSON or streams CSV.",
    summary: "Export rank history",
  },
  getCapabilities: { summary: "Get API capabilities" },
  getHealth: { summary: "Check API health" },
  getLiveness: { summary: "Check web process liveness" },
  getKeywordMetrics: {
    description: "Gets or estimates metrics for up to 700 keywords and requires write scope.",
    summary: "Get keyword metrics",
  },
  getLlmsTxt: { summary: "Get API documentation for LLMs" },
  getOpenApi: { summary: "Get the OpenAPI document" },
  getReadiness: { summary: "Check web traffic readiness" },
  importCloudExport: {
    description: "Requires a migration token.",
    summary: "Run an instance import",
  },
  listSearchPerformanceQueryStats: { summary: "List search query statistics" },
  listSitemapMonitors: {
    description: "Returns the project sitemap monitor and its latest snapshot.",
    summary: "Get sitemap monitor status",
  },
  loadMoreBacklinkRows: { summary: "Load more backlink rows" },
  matchProjectKeywords: { summary: "Match tracked keywords" },
  removeCompetitor: { summary: "Remove a competitor by ID" },
  removeProjectCompetitor: { summary: "Remove a project competitor" },
  researchKeywords: {
    description: "Researches or estimates keywords from one seed and requires write scope.",
    summary: "Research keywords",
  },
  revokeMigrationToken: { summary: "Revoke a migration token by ID" },
  revokeProjectMigrationToken: { summary: "Revoke a project migration token" },
  revokeProjectTeamInvite: { summary: "Revoke a project team invite" },
  revokeTeamInvite: { summary: "Revoke a team invite by ID" },
  runRankCheck: {
    description: "Runs synchronously by default or asynchronously when requested.",
    summary: "Run a rank check",
  },
  syncProjectTraffic: { summary: "Sync analytics traffic" },
  updateSitemapMonitor: { summary: "Update sitemap monitor" },
  uploadCloudImportChunk: { summary: "Upload an instance import chunk" },
};
