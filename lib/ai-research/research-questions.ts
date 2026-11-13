import type { AnswerHighlightEntity } from "@/lib/ai-tracking/answer-highlight";
import { questionGroupKey, type ResearchedPrompt } from "./prompt-research-projection";
import { type ResearchPresence, researchPresence } from "./research-presence";
import type { AiResearchRow } from "./types";

export type ResearchQuestion = {
  answer: string;
  brands: { id: string; kind: "competitor" | "project"; label: string }[];
  contentTruncated: boolean;
  id: string;
  label: string;
  model: string;
  observedAt: string | null;
  presence: ResearchPresence;
  prompt: ResearchedPrompt;
  rowIndex: number;
  text: string;
  tracked: boolean;
  volume: number | undefined;
  youNamed: boolean;
};

/** One tracked question per existing group, classified from the group's answer text. */
export function researchQuestions(
  rows: readonly AiResearchRow[],
  prompts: readonly ResearchedPrompt[],
  entities: readonly AnswerHighlightEntity[],
): ResearchQuestion[] {
  const answers = answersByGroup(rows);
  return prompts.map((prompt) => {
    const leader = rows[prompt.rowIndex];
    const key = questionGroupKey(leader?.prompt ?? prompt.text);
    const group = answers.get(key) ?? [];
    const match = researchPresence(group.length ? group : [leader?.answer ?? ""], entities);
    return {
      answer: leader?.answer ?? "",
      brands: match.brands,
      contentTruncated: prompt.contentTruncated,
      id: String(prompt.rowIndex),
      label: prompt.text,
      model: leader?.model ?? "",
      observedAt: leader?.observedAt ?? null,
      presence: match.presence,
      prompt,
      rowIndex: prompt.rowIndex,
      text: prompt.text,
      tracked: prompt.tracked,
      volume: leader?.datasetVolume,
      youNamed: match.youNamed,
    };
  });
}

function answersByGroup(rows: readonly AiResearchRow[]) {
  const groups = new Map<string, string[]>();
  const ordered = rows
    .map((row, index) => ({ index, row }))
    .sort((left, right) => (right.row.datasetVolume ?? 0) - (left.row.datasetVolume ?? 0));
  for (const entry of ordered) {
    const key = questionGroupKey(entry.row.prompt);
    groups.set(key, [...(groups.get(key) ?? []), entry.row.answer]);
  }
  return groups;
}

export function formatResearchVolume(volume: number | undefined, locale: string) {
  if (volume === undefined || !Number.isFinite(volume)) return null;
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1, notation: "compact" }).format(
    volume,
  );
}

export function formatResearchObservedAt(value: string | null, locale: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}
