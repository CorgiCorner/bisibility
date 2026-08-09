import { Card, MonoText, SectionTitle } from "@/components/ui";
import type { KeywordRow, RankingUrlEvent } from "@/lib/queries/keywords";
import {
  ArrowsLeftRightIcon as ArrowsLeftRight,
  InfoIcon as Info,
  WarningIcon as Warning,
} from "@phosphor-icons/react/ssr";

type RankingUrlHistoryProps = {
  keyword: KeywordRow;
};

type TimelineEvent = RankingUrlEvent & { changed: boolean };

const TOOLTIP =
  "A change means Google now ranks a different page of yours. Often fine; check if the position dropped.";

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

// History arrives oldest-first; mark an entry as "switched" when its URL differs
// from the previous (older) check, then render newest-first.
function buildTimeline(history: RankingUrlEvent[]): TimelineEvent[] {
  return history
    .map((event, index) => ({
      ...event,
      changed: index > 0 && history[index - 1]?.url !== event.url,
    }))
    .reverse();
}

function dotStyle(event: TimelineEvent, isLatest: boolean) {
  if (isLatest) {
    return { background: "var(--accent)", boxShadow: "0 0 0 3px var(--accent-soft)" };
  }
  if (event.changed) {
    return {
      background: "var(--yellow)",
      boxShadow: "0 0 0 3px color-mix(in srgb, var(--yellow) 22%, transparent)",
    };
  }
  return { background: "var(--fg-muted)", boxShadow: "0 0 0 3px var(--bg-sunken)" };
}

export function RankingUrlHistory({ keyword }: Readonly<RankingUrlHistoryProps>) {
  const timeline = buildTimeline(keyword.rankingUrlHistory);
  const urlChanged = timeline.some((event) => event.changed);

  return (
    <Card className="overflow-visible rounded-[14px] p-0" size="lg">
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <SectionTitle>Ranking URL history</SectionTitle>
            <button
              aria-label={TOOLTIP}
              className="bv-tip inline-grid h-4 w-4 cursor-help place-items-center border-0 bg-transparent p-0 text-fg-muted"
              data-tip={TOOLTIP}
              type="button"
            >
              <Info size={14} />
            </button>
          </div>
          <MonoText muted>Which of your pages Google ranks for this keyword</MonoText>
        </div>
        {urlChanged ? (
          <span
            className="inline-flex flex-none items-center gap-[5px] rounded-full px-[9px] py-[3px] font-mono text-[10px] font-semibold tracking-[0.3px]"
            style={{
              backgroundColor: "color-mix(in srgb, var(--yellow) 16%, transparent)",
              color: "var(--yellow-text)",
            }}
          >
            <Warning size={11} weight="fill" />
            URL changed
          </span>
        ) : null}
      </div>
      <div>
        {timeline.length ? (
          timeline.map((event, index) => (
            <div
              className="flex items-center gap-[14px] border-b border-border-soft px-5 py-[13px] last:border-b-0"
              key={`${event.date}-${event.url}-${index}`}
            >
              <span className="flex w-[18px] flex-none justify-center">
                <span
                  className="h-[9px] w-[9px] rounded-full"
                  style={dotStyle(event, index === 0)}
                />
              </span>
              <MonoText className="w-[108px] flex-none text-fg-muted" component="span">
                {event.date}
              </MonoText>
              <a
                className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-fg hover:text-accent-text hover:underline"
                href={event.url}
                rel="noreferrer noopener"
                target="_blank"
              >
                {pathFromUrl(event.url)}
              </a>
              {event.note ? (
                <span className="max-w-[200px] flex-none truncate text-[11.5px] text-fg-muted">
                  {event.note}
                </span>
              ) : null}
              <span className="flex flex-none items-center gap-[7px]">
                {event.changed ? (
                  <span
                    className="inline-flex items-center gap-1 font-mono text-[10px]"
                    style={{ color: "var(--yellow-text)" }}
                  >
                    <ArrowsLeftRight size={11} weight="bold" />
                    switched
                  </span>
                ) : null}
                <span className="font-mono text-[13px] font-semibold text-fg">
                  #{event.position}
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
