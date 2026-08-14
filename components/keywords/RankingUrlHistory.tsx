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
const HISTORY_EXPLANATION =
  "A change means Google now ranks a different page of yours. Often fine; check if it dropped. The rank shown for each period is the position recorded at that period's last check.";
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
              aria-label={HISTORY_EXPLANATION}
              className="bv-tip after:max-w-[280px] inline-grid h-4 w-4 cursor-help place-items-center border-0 bg-transparent p-0 text-fg-muted"
              data-tip={HISTORY_EXPLANATION}
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
              className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-x-[14px] gap-y-1 border-b border-border-soft px-5 py-[13px] last:border-b-0 sm:grid-cols-[18px_108px_minmax(0,1fr)_auto]"
              data-testid="ranking-url-period"
              key={`${event.startAt}-${event.endAt}-${event.url}-${index}`}
            >
              <span className="col-start-1 row-start-1 flex w-[18px] flex-none justify-center">
                <span
                  className={`h-[9px] w-[9px] rounded-full ${
                    event.isCurrent
                      ? "bg-accent-solid"
                      : "border-[1.5px] border-border-strong bg-transparent"
                  }`}
                />
              </span>
              <MonoText
                className="col-start-2 row-start-1 w-[108px] text-fg-muted"
                component="span"
              >
                {periodDateRange(event)}
              </MonoText>
              <div className="col-span-2 col-start-2 row-start-2 min-w-0 sm:col-span-1 sm:col-start-3 sm:row-start-1">
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
                  <a
                    className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-fg hover:text-accent-text hover:underline"
                    href={event.url}
                    rel="noreferrer noopener"
                    target="_blank"
                    title="Open ranking URL in a new tab"
                  >
                    <span>{pathFromUrl(event.url)}</span>
                    <ArrowUpRight
                      aria-hidden
                      className="ml-1 inline-block"
                      size={12}
                      weight="bold"
                    />
                  </a>
                  {periodNote(event, index, timeline.length) ? (
                    <span className="max-w-[200px] truncate text-[11.5px] text-fg-muted">
                      {periodNote(event, index, timeline.length)}
                    </span>
                  ) : null}
                </div>
              </div>
              <span className="col-start-3 row-start-1 flex flex-none items-center gap-[7px] sm:col-start-4">
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
