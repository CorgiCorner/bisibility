import type { OverviewEntityInput, OverviewFilters } from "@/lib/ai-tracking/overview-model";
import type {
  AiVisibilityPromptsModel,
  PromptOutcomeRow,
  PromptPanel,
} from "@/lib/ai-tracking/prompts-model";

export const promptsProjectId = "prj_example";
export const promptsTopicId = "ait_abcdefghijklmnopqrstuvwx";
export const promptsPromptId = "aip_abcdefghijklmnopqrstuvwx";
export const promptsOtherId = "aip_bbcdefghijklmnopqrstuvwx";

export const promptsFilters: OverviewFilters = {
  engine: null,
  market: null,
  period: "30d",
  promptKind: "all",
  topic: null,
};

export const promptsOwn: OverviewEntityInput = {
  aliases: [],
  domain: "acme.example.com",
  excludedNames: [],
  id: "prj_own",
  kind: "project",
  label: "Acme",
};

export const promptsNorth: OverviewEntityInput = {
  aliases: [],
  domain: "north.example.org",
  excludedNames: [],
  id: "cmp_north",
  kind: "competitor",
  label: "North",
};

export function promptsRows(): PromptOutcomeRow[] {
  return [
    {
      cited: 1,
      engines: ["chat_gpt", "gemini"],
      id: promptsPromptId,
      lastRunAt: "2026-10-19T03:10:00.000Z",
      leader: { label: "North", own: false },
      named: 1,
      status: "active",
      text: "Which tools help a small team?",
      topicId: promptsTopicId,
      topicName: "Tools",
      total: 2,
      type: "unbranded",
    },
    {
      cited: 0,
      engines: [],
      id: promptsOtherId,
      lastRunAt: null,
      leader: null,
      named: 0,
      status: "paused",
      text: "What is Acme?",
      topicId: null,
      topicName: null,
      total: 0,
      type: "branded",
    },
  ];
}

export function promptsAnswerPanel(empty = false): PromptPanel {
  return {
    answers: empty
      ? []
      : [
          {
            citations: [
              { position: 1, title: "Guide", url: "https://www.acme.example.com/guide" },
              { position: 2, title: "List", url: "https://north.example.org/list" },
            ],
            costState: "confirmed",
            costUsd: "0.0012",
            engine: "chat_gpt",
            finishedAt: "2026-10-19T03:10:00.000Z",
            id: "asm_abcdefghijklmnopqrstuvwx",
            promptRevisionId: "apr_abcdefghijklmnopqrstuvwx",
            provider: "dataforseo",
            source: "consumer_scrape",
            text: "North is listed. Acme too.",
          },
          {
            citations: [],
            costState: "confirmed",
            costUsd: "0.0012",
            engine: "gemini",
            finishedAt: "2026-10-18T03:10:00.000Z",
            id: "asm_bbcdefghijklmnopqrstuvwx",
            promptRevisionId: "apr_abcdefghijklmnopqrstuvwx",
            provider: "dataforseo",
            source: "consumer_scrape",
            text: "Only North appears.",
          },
        ],
    provenance: "manual",
    promptId: promptsPromptId,
    revision: 2,
    status: "active",
    text: "Which tools help a small team?",
  };
}

export function promptsModel(
  panel: PromptPanel | null = promptsAnswerPanel(),
): AiVisibilityPromptsModel {
  return {
    engines: ["chat_gpt", "gemini"],
    entities: [promptsOwn, promptsNorth],
    filters: promptsFilters,
    markets: [],
    now: "2026-11-10T00:00:00.000Z",
    panel,
    rows: promptsRows(),
    truncated: false,
  };
}
