import type { AnswerHighlightEntity } from "@/lib/ai-tracking/answer-highlight";
import { appPath, asProjectRef } from "@/lib/routing/app-path";

export type ResearchRecentLookup = {
  createdAt: string;
  id: string;
  title: string;
};

/** Serializable Research tab context. The browser never imports the price card. */
export type ResearchTabContext = {
  competitors: readonly { label: string }[];
  competitorsHref: string;
  dailyUsdPerPrompt: number | null;
  engines: readonly string[];
  entities: readonly AnswerHighlightEntity[];
  recent: readonly ResearchRecentLookup[];
};

export function emptyResearchTabContext(projectRef: string): ResearchTabContext {
  return {
    competitors: [],
    competitorsHref: appPath(asProjectRef(projectRef), "settings", "competitors"),
    dailyUsdPerPrompt: null,
    engines: [],
    entities: [],
    recent: [],
  };
}

export function researchCompetitorSummary(labels: readonly string[], limit = 3) {
  const names = labels.map((label) => label.trim()).filter(Boolean);
  if (names.length <= limit) return names.join(", ");
  return `${names.slice(0, limit).join(", ")} +${names.length - limit}`;
}
