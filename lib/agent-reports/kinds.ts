export const RESERVED_AGENT_REPORT_KINDS = [
  "site_audit",
  "ai_visibility",
  "prompt_explorer",
  "prompt_research",
  "challenge_report",
] as const;

export type ReservedAgentReportKind = (typeof RESERVED_AGENT_REPORT_KINDS)[number];

const reservedAgentReportKinds = new Set<string>(RESERVED_AGENT_REPORT_KINDS);

export function isReservedAgentReportKind(kind: string) {
  return reservedAgentReportKinds.has(kind.toLowerCase());
}

/** Kinds the Agent Reports list can filter. `all` is the unfiltered view. */
export const AGENT_REPORT_LIST_KINDS = [
  "all",
  "challenge_report",
  "site_audit",
  "ai_visibility",
  "prompt_explorer",
  "prompt_research",
  "manual_analysis",
] as const;

export type AgentReportListKind = (typeof AGENT_REPORT_LIST_KINDS)[number];
