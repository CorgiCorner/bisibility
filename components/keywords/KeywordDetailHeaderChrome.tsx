import {
  buildGoogleSerpUrl,
  type DimensionKind,
  DimensionSwitcher,
} from "@/components/keywords/filters/DimensionSwitcher";
import { Card, IdChip, ZonedTime } from "@/components/ui";
import { comparableUrl } from "@/lib/alerts/url-mismatch";
import type { KeywordDetailRankState } from "@/lib/keyword-detail/state-model";
import type { KeywordRow } from "@/lib/queries/keywords";
import {
  ArrowUpRightIcon as ArrowUpRight,
  FlagIcon as Flag,
  MonitorIcon as Monitor,
  WarningIcon as Warning,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { KeywordIndexStatus } from "./KeywordIndexStatus";
import { metadataChipClassName } from "./keyword-header-model";

type KeywordDetailHeaderChromeProps = {
  actions: ReactNode;
  dimensionControls?: ReactNode;
  keyword: KeywordRow;
  onTrack?: (kind: DimensionKind, value: string) => void;
  providerId?: string | null;
  rankState?: KeywordDetailRankState;
  timeZone: string;
};

function pathLabel(value: string | null) {
  if (!value) return "Not set";
  if (value.startsWith("/")) return value;
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}` || "/";
  } catch {
    return value;
  }
}

function lastCheckLabel(value: string | null, timeZone: string) {
  if (!value) return "Not checked yet";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 60) return `${minutes || 1} min ago`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)}h ago`;
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    hourCycle: "h23",
    minute: "2-digit",
    month: "short",
    timeZone,
  }).format(new Date(value));
}

function providerLabel(providerId: string | null | undefined) {
  if (providerId === "dataforseo") return "DataForSEO";
  if (providerId === "google") return "Google";
  return providerId ? providerId.replace(/[-_]/g, " ") : "SERP provider";
}

function normalizedTag(value: string) {
  return value.trim().toLocaleLowerCase();
}

function userTags(keyword: KeywordRow) {
  const derived = [keyword.topic, keyword.intent]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => [value, `Topic: ${value}`, `Intent: ${value}`])
    .map(normalizedTag);
  return keyword.tags.filter((tag) => !derived.includes(normalizedTag(tag)));
}

export function KeywordDetailHeaderChrome({
  actions,
  dimensionControls,
  keyword,
  onTrack,
  providerId,
  rankState,
  timeZone,
}: Readonly<KeywordDetailHeaderChromeProps>) {
  const currentRankingUrl = rankState && rankState !== "normal" ? null : keyword.rankingUrl;
  const liveSerpHref = buildGoogleSerpUrl(keyword.keyword, keyword.location);
  const comparableRankingUrl = comparableUrl(currentRankingUrl);
  const comparableTargetUrl = comparableUrl(keyword.targetUrl, currentRankingUrl);
  const targetMismatch = Boolean(
    comparableRankingUrl && comparableTargetUrl && comparableRankingUrl !== comparableTargetUrl,
  );
  const matchesTarget = Boolean(
    comparableRankingUrl && comparableTargetUrl && comparableRankingUrl === comparableTargetUrl,
  );
  const nextCheck = keyword.schedule?.next_check_at ? (
    <ZonedTime timeZone={timeZone} value={keyword.schedule.next_check_at} />
  ) : (
    "Not scheduled"
  );

  return (
    <Card className="rounded-[14px]" size="lg">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <h2 className="m-0 min-w-0 text-[23px] font-semibold leading-tight tracking-[-0.6px]">
              {keyword.keyword}
            </h2>
            <IdChip className="border-border bg-transparent" size="xs" value={keyword.id} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-[7px]">
            {dimensionControls ?? (
              <>
                <DimensionSwitcher
                  icon={<Flag size={13} />}
                  kind="location"
                  label={keyword.location.displayName}
                  onTrack={onTrack}
                  value={keyword.locationName}
                />
                <DimensionSwitcher
                  icon={<Monitor size={13} />}
                  kind="device"
                  label={keyword.device}
                  onTrack={onTrack}
                  value={keyword.device}
                />
              </>
            )}
            {keyword.topic ? (
              <span className={metadataChipClassName}>Topic: {keyword.topic}</span>
            ) : null}
            {keyword.intent ? (
              <span className={metadataChipClassName}>Intent: {keyword.intent}</span>
            ) : null}
            {userTags(keyword).map((tag) => (
              <span className={metadataChipClassName} key={tag}>
                {tag}
              </span>
            ))}
          </div>
          <div
            aria-label="Keyword check metadata"
            className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10.5px] text-fg-muted"
          >
            <span>
              Target{" "}
              <strong className="font-semibold text-fg">{pathLabel(keyword.targetUrl)}</strong>
            </span>
            <span aria-hidden className="h-[11px] w-px bg-border" />
            <span>
              Ranking{" "}
              <strong className="font-semibold text-fg">
                {currentRankingUrl ? pathLabel(currentRankingUrl) : "No ranking URL yet"}
              </strong>
            </span>
            {matchesTarget ? <span>Matches target</span> : null}
            {targetMismatch ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-yellow/15 px-2 py-0.5 font-semibold text-[10px] text-yellow-text">
                <Warning aria-hidden size={11} weight="fill" />
                Target mismatch
              </span>
            ) : null}
            <span aria-hidden className="h-[11px] w-px bg-border" />
            <a
              className="inline-flex items-center gap-1 font-sans text-[11.5px] font-medium text-accent-text hover:underline focus-visible:underline"
              href={liveSerpHref}
              rel="noreferrer noopener"
              target="_blank"
              title="Open live search results in a new tab"
            >
              Open live search results
              <ArrowUpRight aria-hidden size={10} weight="bold" />
            </a>
            <span aria-hidden className="h-[11px] w-px bg-border" />
            <span>Last check {lastCheckLabel(keyword.lastCheckAt, timeZone)}</span>
            <span aria-hidden className="h-[11px] w-px bg-border" />
            <span>Next check {nextCheck}</span>
            <span aria-hidden className="h-[11px] w-px bg-border" />
            <span>{providerLabel(providerId)}</span>
          </div>
        </div>
        {actions}
      </div>
      <KeywordIndexStatus presence={keyword.urlPresence} />
    </Card>
  );
}
