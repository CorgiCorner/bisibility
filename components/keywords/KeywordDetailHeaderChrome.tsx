import {
  buildGoogleSerpUrl,
  type DimensionKind,
  DimensionSwitcher,
} from "@/components/keywords/filters/DimensionSwitcher";
import { Card, IdChip } from "@/components/ui";
import type { KeywordDetailRankState } from "@/lib/keyword-detail/state-model";
import type { KeywordRow } from "@/lib/queries/keywords";
import {
  FlagIcon as Flag,
  GlobeSimpleIcon as GlobeSimple,
  MonitorIcon as Monitor,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { KeywordIndexStatus } from "./KeywordIndexStatus";
import { metadataChipClassName } from "./keyword-header-model";

type KeywordDetailHeaderChromeProps = {
  actions: ReactNode;
  keyword: KeywordRow;
  onTrack?: (kind: DimensionKind, value: string) => void;
  providerId?: string | null;
  rankState?: KeywordDetailRankState;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  month: "short",
});

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

function lastCheckLabel(value: string | null) {
  if (!value) return "Not checked yet";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 60) return `${minutes || 1} min ago`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)}h ago`;
  return dateFormatter.format(new Date(value));
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
  keyword,
  onTrack,
  providerId,
  rankState,
}: Readonly<KeywordDetailHeaderChromeProps>) {
  const currentRankingUrl = rankState && rankState !== "normal" ? null : keyword.rankingUrl;
  const nextCheck = keyword.schedule?.next_check_at
    ? dateFormatter.format(new Date(keyword.schedule.next_check_at))
    : "Not scheduled";

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
            <DimensionSwitcher
              icon={<GlobeSimple size={13} />}
              kind="engine"
              label={keyword.engine}
              onTrack={onTrack}
              serpHref={buildGoogleSerpUrl(keyword.keyword, keyword.location)}
              value={keyword.engine}
            />
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
              </strong>{" "}
              {currentRankingUrl && currentRankingUrl === keyword.targetUrl ? "Matches target" : ""}
            </span>
            <span aria-hidden className="h-[11px] w-px bg-border" />
            <span>Last check {lastCheckLabel(keyword.lastCheckAt)}</span>
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
