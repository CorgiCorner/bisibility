import { Card, MonoText, SectionTitle } from "@/components/ui";
import type { KeywordRow, RankingUrlEvent } from "@/lib/queries/keywords";
import { rankObservationState } from "@/lib/serp/rank-depth";
import {
  ArrowUpRightIcon as ArrowUpRight,
  InfoIcon as Info,
  MinusIcon as Minus,
  WarningIcon as Warning,
} from "@phosphor-icons/react/ssr";

type TimelineEvent = RankingUrlEvent & { changed: boolean };

const POSITION_EXPLANATION = "#N is the position at that period's last check.";
const periodDateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function pathFromUrl(value: string) {
  if (value.startsWith("/")) {
    return value;
  }
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}` || "/";
  } catch {
    return value;
  }
}

// History arrives oldest-first. A changed period has a different URL than its predecessor.
function buildTimeline(history: RankingUrlEvent[]): TimelineEvent[] {
  return history
    .map((event, index) => ({
      ...event,
      changed: index > 0 && history[index - 1]?.url !== event.url,
    }))
    .reverse();
}

function periodDateRange(event: RankingUrlEvent) {
  const startAt = periodDateFormatter.format(new Date(event.startAt));
  return event.isCurrent
    ? `${startAt} - now`
    : `${startAt} - ${periodDateFormatter.format(new Date(event.endAt))}`;
}

function positionLabel(event: RankingUrlEvent) {
  const trackedDepth =
    event.requestedDepth ??
    (typeof event.position === "number" && event.position > 0 ? event.position : undefined);
  return rankObservationState({
    completedChecks: 1,
    position: event.position,
    trackedDepth,
  }).label;
}

function periodNote(event: TimelineEvent, index: number, total: number) {
  if (event.isCurrent) return "Current page";
  if (index === total - 1) return "First indexed for this query";
  return event.changed && event.note === "URL switched" ? event.note : null;
}

export function RankingUrlHistory({ keyword }: Readonly<{ keyword: KeywordRow }>) {
  const timeline = buildTimeline(keyword.rankingUrlHistory);
  const urlChanges = timeline.filter((event) => event.changed).length;
  const changeState = timeline.length < 2 ? "first_check" : urlChanges > 0 ? "diff" : "no_change";

  return (
    <Card className="overflow-visible rounded-[14px] p-0" size="lg">
      <div className="border-b border-border px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <SectionTitle>Ranking URL history</SectionTitle>
            <button
              aria-label={POSITION_EXPLANATION}
              className="bv-tip after:max-w-[280px] inline-grid h-4 w-4 cursor-help place-items-center border-0 bg-transparent p-0 text-fg-muted"
              data-tip={POSITION_EXPLANATION}
              type="button"
            >
              <Info size={14} />
            </button>
            {changeState === "diff" ? (
              <span className="inline-flex h-6 items-center gap-1 rounded-full border border-yellow px-2 font-mono text-[10.5px] font-semibold text-yellow-text">
                <Warning size={11} weight="fill" />
                URL changed
              </span>
            ) : null}
            {changeState === "no_change" ? (
              <span className="inline-flex items-center gap-1 font-mono text-[10.5px] text-fg-muted">
                <Minus size={12} weight="bold" />
                No change
              </span>
            ) : null}
          </div>
          <p className="m-0 mt-1 text-[12px] text-fg-muted">
            Which of your pages Google ranks for this keyword. {POSITION_EXPLANATION}
          </p>
        </div>
      </div>
      <div>
        {timeline.length ? (
          timeline.map((event, index) => (
            <div
              className="flex items-center gap-[14px] border-b border-border-soft px-5 py-[13px] last:border-b-0"
              key={`${event.startAt}-${event.endAt}-${event.url}-${index}`}
            >
              <span className="flex w-[18px] flex-none justify-center">
                <span
                  className={`h-[9px] w-[9px] rounded-full ${
                    event.isCurrent
                      ? "bg-accent-solid"
                      : "border-[1.5px] border-border-strong bg-transparent"
                  }`}
                />
              </span>
              <MonoText className="w-[108px] flex-none text-fg-muted" component="span">
                {periodDateRange(event)}
              </MonoText>
              <a
                className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-fg hover:text-accent-text hover:underline"
                href={event.url}
                rel="noreferrer noopener"
                target="_blank"
                title="Open ranking URL in a new tab"
              >
                <span>{pathFromUrl(event.url)}</span>
                <ArrowUpRight aria-hidden className="ml-1 inline-block" size={12} weight="bold" />
              </a>
              {periodNote(event, index, timeline.length) ? (
                <span className="max-w-[200px] flex-none truncate text-[11.5px] text-fg-muted">
                  {periodNote(event, index, timeline.length)}
                </span>
              ) : null}
              <span className="flex flex-none items-center gap-[7px]">
                <span className="font-mono text-[13px] font-semibold text-fg">
                  {positionLabel(event)}
                </span>
              </span>
            </div>
          ))
        ) : (
          <div className="px-5 py-8 text-center">
            <p className="m-0 text-[13px] font-semibold text-fg">No ranking URL observed yet</p>
            <p className="m-0 mt-1 text-[12px] text-fg-muted">
              Completed checks have not returned a ranking page for this keyword.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
