import type { ProjectBrandNamesView } from "@/lib/ai-tracking/brand-name-projection";
import type {
  AiVisibilityOverviewLoad,
  OverviewAnswerInput,
  OverviewEntityInput,
  OverviewFilters,
} from "@/lib/ai-tracking/overview-model";
import { projectAiVisibilityOverview } from "@/lib/ai-tracking/overview-projection";

const own: OverviewEntityInput = {
  aliases: ["Acme Tools"],
  domain: "acme.example.com",
  excludedNames: ["acme.example.org"],
  id: "prj_abcdefghijklmnopqrstuvwx",
  kind: "project",
  label: "Acme",
};

const competitor: OverviewEntityInput = {
  aliases: ["Northwind"],
  domain: "north.example.org",
  excludedNames: [],
  id: "cmp_abcdefghijklmnopqrstuvwx",
  kind: "competitor",
  label: "North",
};

const answers: OverviewAnswerInput[] = [
  {
    answerText: "Acme Tools and Northwind both appear.",
    citations: [
      { url: "https://acme.example.com/a" },
      { url: "https://www.acme.example.com/b" },
      { url: "https://north.example.org/c" },
      { url: "https://guides.example.com/d" },
    ],
    costMicros: 1200,
    engine: "chat_gpt",
    finishedAt: "2026-10-19T15:00:00.000Z",
    id: "branded",
    promptText: "What is Acme?",
    provider: "dataforseo",
  },
  {
    answerText: "See north.example.org only.",
    citations: [{ url: "https://guides.example.com/e" }, { url: "https://lists.example.org/f" }],
    costMicros: 1200,
    engine: "chat_gpt",
    finishedAt: "2026-10-19T16:00:00.000Z",
    id: "unbranded-miss",
    promptText: "best catalogs",
    provider: "dataforseo",
  },
  {
    answerText: "Acme is listed.",
    citations: [{ url: "https://guides.example.com/g" }],
    costMicros: null,
    engine: "gemini",
    finishedAt: "2026-10-20T15:00:00.000Z",
    id: "unbranded-hit",
    promptText: "more catalogs",
    provider: "dataforseo",
  },
];

const baseFilters: OverviewFilters = {
  engine: null,
  market: null,
  period: "30d",
  promptKind: "all",
  topic: null,
};

export const overviewProjectId = "prj_abcdefghijklmnopqrstuvwx";

export const overviewBrandNames: ProjectBrandNamesView = {
  aliases: ["Acme Tools"],
  canWrite: true,
  counts: { answers: 3, named: 2, names: [{ count: 2, name: "Acme" }] },
  domain: "acme.example.com",
  domainSuggestion: null,
  excludedNames: ["acme.example.org"],
  keywordSuggestions: [],
  label: "Acme",
  projectId: overviewProjectId,
};

export const overviewHrefs = {
  addPrompt: "/app/prj_abcdefghijklmnopqrstuvwx/ai-visibility?tab=prompts&compose=prompt",
  competitors: "/app/prj_abcdefghijklmnopqrstuvwx/settings/competitors",
  engines: null,
  run: "/app/prj_abcdefghijklmnopqrstuvwx/ai-visibility?tab=prompts&compose=run",
  schedules: "/app/prj_abcdefghijklmnopqrstuvwx/schedules",
  sources: null,
};

export function overviewFixture(
  promptKind: OverviewFilters["promptKind"] = "all",
): AiVisibilityOverviewLoad {
  return {
    canAddCompetitor: true,
    engines: ["chat_gpt", "gemini"],
    filters: { ...baseFilters, promptKind },
    hasAnswers: true,
    markets: [{ key: "n:United%20States:en", label: "United States · English" }],
    overview: projectAiVisibilityOverview({
      answers,
      entities: [own, competitor],
      promptKind,
      timeZone: "UTC",
      truncated: false,
    }),
    topics: [{ id: "ait_abcdefghijklmnopqrstuvwx", name: "Catalogs" }],
    windowFrom: "2026-10-11T00:00:00.000Z",
  };
}

export function emptyOverviewFixture(): AiVisibilityOverviewLoad {
  return {
    ...overviewFixture(),
    engines: [],
    hasAnswers: false,
    markets: [],
    overview: projectAiVisibilityOverview({
      answers: [],
      entities: [own],
      promptKind: "all",
      timeZone: "UTC",
      truncated: false,
    }),
    topics: [],
  };
}
