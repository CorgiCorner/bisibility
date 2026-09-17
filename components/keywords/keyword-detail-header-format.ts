import type { KeywordRow } from "@/lib/queries/keywords";
import type { useTranslations } from "next-intl";

type DetailTranslations = ReturnType<typeof useTranslations<"projectRankTracker.keywordDetail">>;

const topicTags = new Map([
  ["product", "product"],
  ["docs", "docs"],
  ["comparison", "comparison"],
]);

export function pathLabel(value: string | null | undefined, notSet: string) {
  if (!value) return notSet;
  if (value.startsWith("/")) return value;
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}` || "/";
  } catch {
    return value;
  }
}

export function compactDate(
  value: string,
  locale: string,
  timeZone: string,
  t: DetailTranslations,
) {
  const parts = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone,
  }).formatToParts(new Date(value));
  const day = parts.find((part) => part.type === "day")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return day && month ? t("header.compactDate", { day, month }) : "-";
}

function dateTimeLabel(
  value: string,
  locale: string,
  projectTimeZone: string,
  browserTimeZone: string | null,
  t: DetailTranslations,
) {
  const displayTimeZone = browserTimeZone ?? projectTimeZone;
  const parts = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "short",
    timeZone: displayTimeZone,
    year: "numeric",
  }).formatToParts(new Date(value));
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const currentYear = new Intl.DateTimeFormat(locale, {
    timeZone: displayTimeZone,
    year: "numeric",
  }).format(new Date());
  return t("header.dateTime", {
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    month: read("month"),
    suffix: browserTimeZone && browserTimeZone !== projectTimeZone ? t("header.yourTime") : "",
    year: read("year") === currentYear ? "" : ` ${read("year")}`,
  });
}

export function lastCheckLabel(
  value: string | null,
  locale: string,
  timeZone: string,
  browserTimeZone: string | null,
  t: DetailTranslations,
) {
  if (!value) return t("header.notCheckedYet");
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 60) return t("header.minutesAgo", { count: minutes || 1 });
  if (minutes < 1_440) return t("header.hoursAgo", { count: Math.floor(minutes / 60) });
  return dateTimeLabel(value, locale, timeZone, browserTimeZone, t);
}

export function keywordChips(keyword: KeywordRow) {
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
