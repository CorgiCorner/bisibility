"use client";

import { buildGoogleSerpUrl } from "@/components/keywords/filters/DimensionSwitcher";
import { Card } from "@/components/ui/Card";
import { IdChip } from "@/components/ui/IdChip";
import { useBrowserTimeZone } from "@/components/ui/ZonedTime";
import type { KeywordDetailRankState } from "@/lib/keyword-detail/state-model";
import type { KeywordRow } from "@/lib/queries/keywords";
import { resolveSerpDepth } from "@/lib/serp/constants";
import { ArrowUpRightIcon as ArrowUpRight } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import type { ReactNode } from "react";
import { KeywordDetailHeaderSlot } from "./KeywordDetailHeaderSlot";
import { KeywordIndexStatus } from "./KeywordIndexStatus";
import { keywordMetricsAvailabilityNote, metadataChipClassName } from "./keyword-header-model";

type KeywordDetailHeaderChromeProps = {
  actions: ReactNode;
  keyword: KeywordRow;
  onChangeSchedule?: () => void;
  providerLabel?: string | null;
  rankState?: KeywordDetailRankState;
  searchConsoleConnected?: boolean;
  timeZone: string;
};

const topicTags = new Map([
  ["product", "Product"],
  ["docs", "Docs"],
  ["comparison", "Comparison"],
]);

function pathLabel(value: string | null | undefined) {
  if (!value) return "Not set";
  if (value.startsWith("/")) return value;
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}` || "/";
  } catch {
    return value;
  }
}

function compactDate(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone,
  }).formatToParts(new Date(value));
  const day = parts.find((part) => part.type === "day")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return day && month ? `${day} ${month}` : "-";
}

function dateTimeLabel(value: string, projectTimeZone: string, browserTimeZone: string | null) {
  const displayTimeZone = browserTimeZone ?? projectTimeZone;
  const options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "short",
    timeZone: displayTimeZone,
    year: "numeric",
  };
  const parts = new Intl.DateTimeFormat("en-GB", options).formatToParts(new Date(value));
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const currentYear = new Intl.DateTimeFormat("en-GB", {
    timeZone: displayTimeZone,
    year: "numeric",
  }).format(new Date());
  const year = read("year") === currentYear ? "" : ` ${read("year")}`;
  const suffix = browserTimeZone && browserTimeZone !== projectTimeZone ? " (your time)" : "";
  return `${read("day")} ${read("month")}${year}, ${read("hour")}:${read("minute")}${suffix}`;
}

function lastCheckLabel(value: string | null, timeZone: string, browserTimeZone: string | null) {
  if (!value) return "Not checked yet";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 60) return `${minutes || 1} min ago`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)}h ago`;
  return dateTimeLabel(value, timeZone, browserTimeZone);
}

function keywordChips(keyword: KeywordRow) {
  const mappedTopic = keyword.topic
    ? null
    : (keyword.tags.find((tag) => topicTags.has(tag.trim().toLocaleLowerCase())) ?? null);
  const excluded = new Set(
    [keyword.topic, keyword.intent, mappedTopic]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.trim().toLocaleLowerCase()),
  );
  return {
    intent: keyword.intent,
    tags: keyword.tags.filter((tag) => !excluded.has(tag.trim().toLocaleLowerCase())),
    topic:
      keyword.topic ?? (mappedTopic ? topicTags.get(mappedTopic.trim().toLocaleLowerCase()) : null),
  };
}
export function KeywordDetailHeaderChrome({
  actions,
  keyword,
  onChangeSchedule,
  providerLabel,
  rankState = "normal",
  searchConsoleConnected = false,
  timeZone,
}: Readonly<KeywordDetailHeaderChromeProps>) {
  const browserTimeZone = useBrowserTimeZone();
  const currentRankingUrl = rankState === "normal" ? keyword.rankingUrl : null;
  const expectedUrl =
    keyword.currentExpectedUrl !== undefined
      ? keyword.currentExpectedUrl
      : (keyword.expectedUrl ?? keyword.targetUrl);
  const expectedUrlDetail = `Expected for this market: ${pathLabel(expectedUrl)}${expectedUrl && keyword.expectedUrlSource ? ` (${keyword.expectedUrlSource})` : ""}`;
  const liveSerpHref = buildGoogleSerpUrl(keyword.keyword, keyword.location);
  const schedule = keyword.checkSchedule ?? null;
  const unavailableMetricCopy = keywordMetricsAvailabilityNote(keyword);
  const previousCheck = keyword.completedComparableChecks?.at(-2);
  const projectDepth = resolveSerpDepth(keyword.projectSerpDepth);
  const positionDetail =
    rankState === "not_ranked"
      ? `Not in top ${projectDepth} · Tracked since ${compactDate(keyword.createdAt, timeZone)}`
      : previousCheck
        ? `vs #${previousCheck.position} on ${compactDate(previousCheck.checkedAt, timeZone)}${keyword.bestPosition !== null ? ` · Best #${keyword.bestPosition} in 30d` : ""}`
        : keyword.bestPosition !== null
          ? `Best #${keyword.bestPosition} in 30d`
          : "";
  const chips = keywordChips(keyword);
  const position =
    rankState === "not_ranked"
      ? "Not ranked"
      : keyword.hasRankData
        ? `#${keyword.position}`
        : "No data";
  const positionState = rankState === "normal" && keyword.hasRankData ? "numeric" : "textual";

  return (
    <Card className="rounded-card" size="lg">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <h1 className="m-0 min-w-0 text-[23px] font-semibold leading-tight tracking-[-0.6px] text-fg">
            {keyword.keyword}
          </h1>
          <IdChip className="border-border bg-transparent" size="xs" value={keyword.id} />
        </div>
        {actions}
      </div>
      {chips.topic || chips.intent || chips.tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-[7px]">
          {chips.topic ? <span className={metadataChipClassName}>Topic: {chips.topic}</span> : null}
          {chips.intent ? (
            <span className={metadataChipClassName}>Intent: {chips.intent}</span>
          ) : null}
          {chips.tags.map((tag) => (
            <span className={metadataChipClassName} key={tag}>
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      <div
        aria-label="Keyword check metadata"
        className="mt-3.5 grid grid-cols-1 gap-x-[26px] gap-y-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <KeywordDetailHeaderSlot detail={positionDetail} label="Position" state={positionState}>
          {position}
        </KeywordDetailHeaderSlot>
        <KeywordDetailHeaderSlot
          detail={
            <span>
              {expectedUrlDetail} ·{" "}
              <a
                className="inline-flex items-center gap-1 font-semibold text-accent-text hover:underline"
                href={liveSerpHref}
                rel="noreferrer noopener"
                target="_blank"
              >
                View SERP <ArrowUpRight aria-hidden size={9} weight="regular" />
              </a>
            </span>
          }
          label="Ranking URL"
          state="textual"
        >
          {currentRankingUrl ? (
            <a
              className="flex min-w-0 items-center gap-1 text-[12.5px] font-semibold text-fg hover:text-accent-text hover:underline"
              href={currentRankingUrl}
              rel="noreferrer noopener"
              target="_blank"
            >
              <span className="truncate">{pathLabel(currentRankingUrl)}</span>
              <ArrowUpRight aria-hidden className="shrink-0" size={10} weight="regular" />
            </a>
          ) : (
            "No ranking URL yet"
          )}
        </KeywordDetailHeaderSlot>
        <KeywordDetailHeaderSlot
          detail={`via ${providerLabel ?? keyword.dataProvider ?? "Unknown"}`}
          label="Last check"
          state="textual"
        >
          <span className="font-sans tabular-nums text-[12.5px] font-semibold text-fg">
            {lastCheckLabel(keyword.lastCheckAt, timeZone, browserTimeZone)}
          </span>
        </KeywordDetailHeaderSlot>
        <KeywordDetailHeaderSlot
          detail={
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <span>{schedule?.name ?? "Manual"}</span>
              {onChangeSchedule ? (
                <button
                  className="p-0 font-sans tabular-nums text-[11px] font-semibold text-accent-text hover:underline"
                  onClick={onChangeSchedule}
                  title="Sets the schedule for this market and device. Other markets keep theirs."
                  type="button"
                >
                  {schedule ? "change" : "set schedule"}
                </button>
              ) : null}
            </span>
          }
          label="Next check"
          state="textual"
        >
          <span className="font-sans tabular-nums text-[12.5px] font-semibold text-fg">
            {schedule ? "Scheduled" : "Not scheduled"}
          </span>
        </KeywordDetailHeaderSlot>
        <KeywordDetailHeaderSlot
          detail={keyword.volumeKnown === false ? "Not available" : "Monthly searches"}
          label="Volume"
          state={keyword.volumeKnown === false ? "textual" : "numeric"}
        >
          <span className="font-sans tabular-nums text-[12.5px] font-semibold text-fg">
            {keyword.volumeKnown === false
              ? "n/a"
              : keyword.volume >= 1000
                ? `${(keyword.volume / 1000).toFixed(keyword.volume >= 10_000 ? 0 : 1)}k/mo`
                : `${keyword.volume}/mo`}
          </span>
        </KeywordDetailHeaderSlot>
        <KeywordDetailHeaderSlot
          detail={keyword.cpcKnown === false ? "Not available" : "Average cost per click"}
          label="CPC"
          state={keyword.cpcKnown === false ? "textual" : "numeric"}
        >
          <span className="font-sans tabular-nums text-[12.5px] font-semibold text-fg">
            {keyword.cpcKnown === false ? "n/a" : `$${keyword.cpc}`}
          </span>
        </KeywordDetailHeaderSlot>
        <KeywordDetailHeaderSlot
          detail={
            keyword.difficultyKnown === false
              ? "Not available"
              : keyword.difficulty < 35
                ? "Easy"
                : keyword.difficulty < 65
                  ? "Medium"
                  : "Hard"
          }
          label="Difficulty"
          state={keyword.difficultyKnown === false ? "textual" : "numeric"}
        >
          <span className="font-sans tabular-nums text-[12.5px] font-semibold text-fg">
            {keyword.difficultyKnown === false ? "n/a" : keyword.difficulty}
          </span>
        </KeywordDetailHeaderSlot>
        <KeywordDetailHeaderSlot detail="Not available" label="Competition" state="textual">
          <span className="font-sans tabular-nums text-[12.5px] font-semibold text-fg">n/a</span>
        </KeywordDetailHeaderSlot>
        {unavailableMetricCopy ? (
          <p className="m-0 text-[11px] text-fg-muted sm:col-span-2 xl:col-span-4">
            {unavailableMetricCopy}
          </p>
        ) : null}
      </div>
      {searchConsoleConnected ? <KeywordIndexStatus presence={keyword.urlPresence} /> : null}
    </Card>
  );
}
