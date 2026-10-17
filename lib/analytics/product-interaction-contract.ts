export const PRODUCT_MODULES = [
  "dashboard",
  "getting-started",
  "rank-tracker",
  "search-console",
  "keyword-research",
  "domain-overview",
  "backlinks",
  "competitors",
  "ai-tracking",
  "ai-visibility",
  "prompt-explorer",
  "site-audit",
  "project-context",
  "agent-reports",
  "alerts",
  "runs",
  "markets",
  "integrations",
  "settings",
  "install",
  "timeline",
] as const;

export type ProductModule = (typeof PRODUCT_MODULES)[number];
export type NavigationClickSource = "sidebar" | "command_palette" | "getting_started_nav";

/** Read only the allowlisted section; project, market and resource IDs never leave the browser. */
export function productModuleForPath(path: string): ProductModule | null {
  const section = /^\/app\/[^/?#]+\/(?:m\/[^/?#]+\/)?([^/?#]+)(?:[/?#]|$)/.exec(path)?.[1];
  return PRODUCT_MODULES.find((module) => module === section) ?? null;
}
