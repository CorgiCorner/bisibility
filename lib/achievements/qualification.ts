const operations = new Set([
  "listKeywords",
  "getKeyword",
  "getProject",
  "listProjects",
  "getKeywordMetrics",
  "createProject",
  "addKeywords",
  "researchKeywords",
  "analyzeBacklinks",
  "analyzeDomainOverview",
  "runSiteAudit",
  "getSiteAudit",
  "getAgentReport",
  "createAgentReport",
  "exportRankHistory",
  "listSavedKeywords",
  "createSavedKeywords",
  "runAiResearch",
  "analyzeAiVisibility",
  "compareAiPrompts",
  "getKeywordHistory",
]);
export function qualifiesPractice(input: {
  actorId?: string | null;
  operation: string;
  success: boolean;
  background?: boolean;
  estimate?: boolean;
}) {
  return Boolean(
    input.actorId &&
      input.success &&
      !input.background &&
      !input.estimate &&
      operations.has(input.operation),
  );
}
