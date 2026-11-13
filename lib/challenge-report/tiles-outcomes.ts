import type { BrandNameSet } from "@/lib/ai-tracking/brand-name-match";
import { matchBrandNamesInAnswer } from "@/lib/ai-tracking/brand-name-match";
import { roundMinor } from "@/lib/cost-items/monthly";
import { eachDate } from "./period";
import type {
  ChallengeActiveDaysTile,
  ChallengeAiTile,
  ChallengeConversionsTile,
  ChallengeCostTile,
  ChallengeTop10Tile,
} from "./schema";
import { unavailableTile } from "./tile-state";

export function activeDaysTileFor(
  input: {
    activeDates: readonly string[];
    from: string;
    to: string;
  } & { tracked: boolean },
): ChallengeActiveDaysTile {
  if (!input.tracked) return unavailableTile("no_data", "activity_off");
  return buildActiveDaysTile(input);
}

export function buildActiveDaysTile(input: {
  activeDates: readonly string[];
  scope?: "user" | "project";
  from: string;
  to: string;
}): ChallengeActiveDaysTile {
  const active = new Set(input.activeDates);
  const days = eachDate(input.from, input.to).map((date) => ({
    active: active.has(date),
    date,
  }));
  const skipped = days.filter((day) => !day.active).map((day) => day.date);
  return {
    activeCount: days.length - skipped.length,
    days,
    scope: input.scope ?? "user",
    skipped,
    state: "ok",
  };
}

export type ChallengeAiSample = {
  answerText: string;
  at: string;
  engine: string;
  promptId: string;
};

export function buildAiAnswersTile(input: {
  connected: boolean;
  day1: string;
  end: string;
  names: BrandNameSet;
  prompts: readonly { id: string; text: string }[];
  samples: readonly ChallengeAiSample[];
}): ChallengeAiTile {
  const unbranded = input.prompts.filter(
    (prompt) => !matchBrandNamesInAnswer(prompt.text, input.names).named,
  );
  if (!input.connected && input.samples.length === 0) {
    return unavailableTile("not_connected", "ai_visibility");
  }
  if (unbranded.length === 0) return unavailableTile("no_data", "no_prompts");
  if (input.samples.length === 0) return unavailableTile("no_data", "no_answers");
  const engines = [...new Set(input.samples.map((sample) => sample.engine))].slice(0, 8);
  const rows = engines.map((engine) => ({
    day1Named: namedCount(unbranded, input.samples, input.names, engine, input.day1).named,
    day1Total: namedCount(unbranded, input.samples, input.names, engine, input.day1).total,
    engine,
    named: namedCount(unbranded, input.samples, input.names, engine, input.end).named,
    total: namedCount(unbranded, input.samples, input.names, engine, input.end).total,
  }));
  const end = namedOnAnyEngine(unbranded, input.samples, input.names, input.end);
  const day1 = namedOnAnyEngine(unbranded, input.samples, input.names, input.day1);
  return {
    day1Named: day1.named,
    day1Total: day1.total,
    engines: rows,
    named: end.named,
    state: "ok",
    total: end.total,
  };
}

function latestAnswer(
  samples: readonly ChallengeAiSample[],
  promptId: string,
  engine: string | null,
  asOf: string,
) {
  const matches = samples.filter(
    (sample) =>
      sample.promptId === promptId &&
      sample.at.slice(0, 10) <= asOf &&
      (engine === null || sample.engine === engine),
  );
  matches.sort((left, right) => right.at.localeCompare(left.at));
  return matches[0] ?? null;
}

function namedCount(
  prompts: readonly { id: string }[],
  samples: readonly ChallengeAiSample[],
  names: BrandNameSet,
  engine: string,
  asOf: string,
) {
  let named = 0;
  let total = 0;
  for (const prompt of prompts) {
    const answer = latestAnswer(samples, prompt.id, engine, asOf);
    if (!answer) continue;
    total += 1;
    if (matchBrandNamesInAnswer(answer.answerText, names).named) named += 1;
  }
  return { named, total };
}

function namedOnAnyEngine(
  prompts: readonly { id: string }[],
  samples: readonly ChallengeAiSample[],
  names: BrandNameSet,
  asOf: string,
) {
  let named = 0;
  let total = 0;
  for (const prompt of prompts) {
    const answer = latestAnswer(samples, prompt.id, null, asOf);
    if (!answer) continue;
    total += 1;
    const engines = new Set(
      samples
        .filter((sample) => sample.promptId === prompt.id && sample.at.slice(0, 10) <= asOf)
        .map((sample) => sample.engine),
    );
    const namedHere = [...engines].some((engine) => {
      const latest = latestAnswer(samples, prompt.id, engine, asOf);
      return latest ? matchBrandNamesInAnswer(latest.answerText, names).named : false;
    });
    if (namedHere) named += 1;
  }
  return { named, total };
}

export function buildTop10Tile(input: {
  end: readonly { keyword: string; position: number }[];
  hasChecks: boolean;
  start: readonly { keyword: string; position: number }[];
  tracked: number;
}): ChallengeTop10Tile {
  if (input.tracked === 0) return unavailableTile("no_data", "no_keywords");
  if (!input.hasChecks) return unavailableTile("no_data", "no_checks");
  const start = new Map(input.start.map((row) => [row.keyword, row.position]));
  let best: { from: number; keyword: string; to: number } | null = null;
  for (const row of input.end) {
    const from = start.get(row.keyword);
    if (from === undefined || from <= row.position) continue;
    if (
      !best ||
      from - row.position > best.from - best.to ||
      (from - row.position === best.from - best.to && row.keyword.localeCompare(best.keyword) < 0)
    ) {
      best = { from, keyword: row.keyword.slice(0, 120), to: row.position };
    }
  }
  return {
    bestJump: best,
    endCount: input.end.filter((row) => row.position <= 10).length,
    hasStart: input.start.length > 0,
    startCount: input.start.filter((row) => row.position <= 10).length,
    state: "ok",
  };
}

export function buildConversionsTile(input: {
  connected: boolean;
  current: number;
  goals: readonly string[];
  previous: number;
}): ChallengeConversionsTile {
  if (!input.connected) return unavailableTile("not_connected", "conversions");
  const goals = [...new Set(input.goals.map((goal) => goal.trim()).filter(Boolean))].slice(0, 20);
  if (goals.length === 0) return unavailableTile("no_data", "no_goals");
  return { current: input.current, goals, previous: input.previous, state: "ok" };
}

export function buildCostTile(input: {
  aiAnswersMinor: number;
  days: number;
  other: readonly { currency: string; minor: number }[];
  rankChecksMinor: number;
  subscriptions: readonly { currency: string; minor: number }[];
}): ChallengeCostTile {
  const subscriptions = positiveLines(input.subscriptions);
  const other = positiveLines(input.other);
  const measured =
    subscriptions.length > 0 ||
    other.length > 0 ||
    input.rankChecksMinor > 0 ||
    input.aiAnswersMinor > 0;
  if (!measured) return unavailableTile("no_data", "empty");
  const currencies = new Set<string>([
    ...subscriptions.map((line) => line.currency),
    ...other.map((line) => line.currency),
  ]);
  if (input.rankChecksMinor > 0 || input.aiAnswersMinor > 0) currencies.add("USD");
  const currency = currencies.size === 1 ? [...currencies][0] : null;
  const totalMinor =
    currency === null
      ? null
      : lineMinor(subscriptions, currency) +
        lineMinor(other, currency) +
        (currency === "USD" ? input.rankChecksMinor + input.aiAnswersMinor : 0);
  return {
    aiAnswersMinor: input.aiAnswersMinor,
    currency,
    other,
    perDayMinor: totalMinor === null ? null : roundMinor(totalMinor, input.days),
    rankChecksMinor: input.rankChecksMinor,
    state: "ok",
    subscriptions,
    totalMinor,
  };
}

function positiveLines(lines: readonly { currency: string; minor: number }[]) {
  const totals = new Map<string, number>();
  for (const line of lines) {
    if (line.minor <= 0) continue;
    totals.set(line.currency, (totals.get(line.currency) ?? 0) + line.minor);
  }
  return [...totals.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([currency, minor]) => ({ currency, minor }));
}

function lineMinor(lines: readonly { currency: string; minor: number }[], currency: string) {
  return lines.find((line) => line.currency === currency)?.minor ?? 0;
}
