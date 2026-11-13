import { type BrandNameSet, matchBrandNamesInAnswer } from "@/lib/ai-tracking/brand-name-match";
import { TRACKING_ENGINES, type TrackingEngine } from "@/lib/ai-tracking/contract";
import type { OverviewEntityInput, OverviewFilters } from "@/lib/ai-tracking/overview-model";
import { projectAiVisibilityOverview } from "@/lib/ai-tracking/overview-projection";
import type {
  PromptAnswerRecord,
  PromptDataRow,
  PromptOutcomeRow,
  PromptPanel,
  PromptPanelAnswer,
  PromptProjectionPrompt,
  PromptSectionRow,
  PromptTableRow,
} from "@/lib/ai-tracking/prompts-model";

export type PromptProjection = {
  panel: PromptPanel | null;
  rows: readonly PromptOutcomeRow[];
};

/**
 * One row per visible prompt. Named, cited and leader are the Overview projection
 * of that prompt's answers under the same filters, so a single-prompt slice matches.
 */
export function projectPromptOutcomes(input: {
  answers: readonly PromptAnswerRecord[];
  entities: readonly OverviewEntityInput[];
  filters: OverviewFilters;
  prompts: readonly PromptProjectionPrompt[];
  selectedPromptId: string | null;
  timeZone: string;
}): PromptProjection {
  const own = input.entities.find((entity) => entity.kind === "project");
  if (!own) throw new Error("AI Visibility prompts require the project brand.");
  const ownNames = nameSet(own);
  const byPrompt = new Map<string, PromptAnswerRecord[]>();
  for (const answer of input.answers) {
    const list = byPrompt.get(answer.promptId);
    if (list) list.push(answer);
    else byPrompt.set(answer.promptId, [answer]);
  }
  const rows: PromptOutcomeRow[] = [];
  let panel: PromptPanel | null = null;
  for (const prompt of input.prompts) {
    if (!showsPrompt(prompt, input.filters, ownNames)) continue;
    const branded = matchBrandNamesInAnswer(prompt.text, ownNames).named;
    const counted = countedAnswers(byPrompt.get(prompt.id) ?? [], ownNames, input.filters);
    const overview = projectAiVisibilityOverview({
      answers: counted,
      entities: input.entities,
      promptKind: "all",
      timeZone: input.timeZone,
      truncated: false,
    });
    const row: PromptOutcomeRow = {
      cited: overview.cited.cited,
      engines: promptEngines(prompt, counted, input.filters.engine),
      id: prompt.id,
      lastRunAt: latestTime(counted),
      leader: overview.shareOfVoice
        ? { label: overview.shareOfVoice.leader.label, own: overview.shareOfVoice.leader.own }
        : null,
      named: overview.mentioned.named,
      status: prompt.status,
      text: prompt.text,
      topicId: prompt.topicId,
      topicName: prompt.topicName,
      total: overview.mentioned.total,
      type: branded ? "branded" : "unbranded",
    };
    rows.push(row);
    if (prompt.id === input.selectedPromptId) {
      panel = {
        answers: latestByEngine(counted),
        provenance: prompt.provenance,
        promptId: prompt.id,
        revision: prompt.revision,
        status: prompt.status,
        text: prompt.text,
      };
    }
  }
  return { panel, rows };
}

export function groupPromptRows(rows: readonly PromptOutcomeRow[]): PromptTableRow[] {
  const groups = new Map<string, PromptOutcomeRow[]>();
  for (const row of rows) {
    const key = row.topicId ?? "";
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  const keys = [...groups.keys()].sort((left, right) => {
    if (!left) return 1;
    if (!right) return -1;
    const leftName = groups.get(left)?.[0]?.topicName ?? "";
    const rightName = groups.get(right)?.[0]?.topicName ?? "";
    return leftName.localeCompare(rightName, "en");
  });
  return keys.flatMap((key) => {
    const items = groups.get(key) ?? [];
    const topicName = key ? (items[0]?.topicName ?? null) : null;
    const section: PromptSectionRow = {
      count: items.length,
      id: `topic:${key || "none"}`,
      kind: "section",
      label: topicName ?? "",
      topicName,
    };
    const data: PromptDataRow[] = items.map((item) => ({ ...item, kind: "row", label: item.text }));
    return [section, ...data];
  });
}

export function overlayPromptRows(
  rows: readonly PromptOutcomeRow[],
  prompts: readonly PromptProjectionPrompt[],
  filters: OverviewFilters,
  entities: readonly OverviewEntityInput[],
): PromptOutcomeRow[] {
  const own = entities.find((entity) => entity.kind === "project");
  const ownNames = own ? nameSet(own) : null;
  const byId = new Map(prompts.map((prompt) => [prompt.id, prompt]));
  const synced = rows.flatMap((row) => {
    const prompt = byId.get(row.id);
    if (!prompt || !showsPrompt(prompt, filters, ownNames)) return [];
    const branded = ownNames ? matchBrandNamesInAnswer(prompt.text, ownNames).named : false;
    return [
      {
        ...row,
        status: prompt.status,
        text: prompt.text,
        topicId: prompt.topicId,
        topicName: prompt.topicName,
        type: branded ? ("branded" as const) : ("unbranded" as const),
      },
    ];
  });
  const known = new Set(synced.map((row) => row.id));
  const extras = projectPromptOutcomes({
    answers: [],
    entities,
    filters,
    prompts: prompts.filter((prompt) => !known.has(prompt.id)),
    selectedPromptId: null,
    timeZone: "UTC",
  }).rows;
  return [...synced, ...extras];
}

export function scheduledPromptEngines(
  promptId: string,
  schedules: readonly {
    configurations?: readonly { engine: string }[];
    enabled: boolean;
    promptIds?: readonly string[];
  }[],
) {
  const engines = new Set<string>();
  for (const schedule of schedules) {
    if (!schedule.enabled || !schedule.promptIds?.includes(promptId)) continue;
    for (const configuration of schedule.configurations ?? []) engines.add(configuration.engine);
  }
  return [...engines];
}

function showsPrompt(
  prompt: PromptProjectionPrompt,
  filters: OverviewFilters,
  ownNames: BrandNameSet | null,
) {
  if (filters.topic && prompt.topicId !== filters.topic) return false;
  const branded = ownNames ? matchBrandNamesInAnswer(prompt.text, ownNames).named : false;
  if (filters.promptKind === "branded" && !branded) return false;
  if (filters.promptKind === "unbranded" && branded) return false;
  return true;
}

function countedAnswers(
  answers: readonly PromptAnswerRecord[],
  ownNames: BrandNameSet,
  filters: OverviewFilters,
) {
  return answers.filter((answer) => {
    const branded = matchBrandNamesInAnswer(answer.promptText, ownNames).named;
    if (filters.promptKind === "branded" && !branded) return false;
    if (filters.promptKind === "unbranded" && branded) return false;
    return true;
  });
}

function promptEngines(
  prompt: PromptProjectionPrompt,
  answers: readonly PromptAnswerRecord[],
  engine: string | null,
) {
  const engines = new Set<string>(answers.map((answer) => answer.engine));
  for (const configured of prompt.configuredEngines) {
    if (!engine || configured === engine) engines.add(configured);
  }
  return [...engines].sort(
    (left, right) => engineRank(left) - engineRank(right) || left.localeCompare(right),
  );
}

function engineRank(engine: string) {
  const index = TRACKING_ENGINES.indexOf(engine as TrackingEngine);
  return index === -1 ? TRACKING_ENGINES.length : index;
}

function latestTime(answers: readonly PromptAnswerRecord[]) {
  let latest: string | null = null;
  for (const answer of answers) {
    if (!answer.finishedAt) continue;
    if (!latest || answer.finishedAt > latest) latest = answer.finishedAt;
  }
  return latest;
}

function latestByEngine(answers: readonly PromptAnswerRecord[]): PromptPanelAnswer[] {
  const sorted = [...answers].sort((left, right) =>
    (right.finishedAt ?? "").localeCompare(left.finishedAt ?? ""),
  );
  const seen = new Set<string>();
  const latest: PromptAnswerRecord[] = [];
  for (const answer of sorted) {
    if (seen.has(answer.engine)) continue;
    seen.add(answer.engine);
    latest.push(answer);
  }
  return latest
    .sort((left, right) => engineRank(left.engine) - engineRank(right.engine))
    .map((answer) => ({
      citations: answer.citations,
      costState: answer.costState,
      costUsd: answer.costUsd,
      engine: answer.engine,
      finishedAt: answer.finishedAt,
      id: answer.sampleId,
      promptRevisionId: answer.promptRevisionId,
      provider: answer.provider,
      source: answer.source,
      text: answer.answerText,
    }));
}

function nameSet(entity: OverviewEntityInput): BrandNameSet {
  return {
    aliases: entity.aliases,
    domain: entity.domain,
    excludedNames: entity.excludedNames,
    label: entity.label,
  };
}
