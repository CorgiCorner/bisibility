import type { KeywordCheckState } from "@/lib/queries/keyword-row";
import { appPath } from "@/lib/routing/app-path";
import { notRankedLabel } from "@/lib/serp/rank-depth";
import type { Icon } from "@phosphor-icons/react";
import {
  ChartLineIcon as ChartLine,
  ClockCountdownIcon as ClockCountdown,
  LinkIcon,
  RankingIcon as Ranking,
} from "@phosphor-icons/react";

export type EmptyRankCopy = {
  badge: string;
  body: string;
  href: string;
  icon: Icon;
  link: string;
  position: string;
  title: string;
};

export function emptyRankCopy(
  state: Exclude<KeywordCheckState, "ranked">,
  projectRef: string,
  trackedDepth = 100,
  providerConnected = true,
): EmptyRankCopy {
  if (state === "running") {
    return {
      badge: "Check running",
      body: "A rank check is currently running. Position, history and ranking URL will appear when it finishes.",
      href: appPath(projectRef, "checks"),
      icon: ClockCountdown,
      link: "View check runs",
      position: "check in progress",
      title: "Rank check in progress",
    };
  }
  if (state === "failed") {
    return {
      badge: "Latest check failed",
      body: "The latest rank check failed before it produced a position. Review the check run, then retry it.",
      href: appPath(projectRef, "checks"),
      icon: ClockCountdown,
      link: "Review check run",
      position: "latest check failed",
      title: "No position from the latest check",
    };
  }
  if (state === "not_ranked") {
    return {
      badge: notRankedLabel(trackedDepth),
      body: `The latest rank check completed, but this domain was not found in the top ${trackedDepth} results.`,
      href: appPath(projectRef, "checks"),
      icon: Ranking,
      link: "View check runs",
      position: `outside top ${trackedDepth}`,
      title: `Not ranked in the top ${trackedDepth}`,
    };
  }
  return {
    badge: "First check pending",
    body: providerConnected
      ? "No rank check has been attempted yet. Run the first check to see position, history and ranking URL."
      : "No rank check has been attempted yet. Connect a SERP provider to run the first check and see position, history and ranking URL.",
    href: appPath(projectRef, "integrations"),
    icon: ClockCountdown,
    link: "Connect a SERP provider",
    position: "awaiting first check",
    title: "No ranking data yet",
  };
}

const TEASERS: { copy: string; icon: Icon; title: string }[] = [
  {
    copy: "Daily rank with movement vs the previous check.",
    icon: Ranking,
    title: "Position & change",
  },
  {
    copy: "A trend line once checks accumulate.",
    icon: ChartLine,
    title: "Position history",
  },
  {
    copy: "Which page ranks, plus competitors.",
    icon: LinkIcon,
    title: "Ranking URL",
  },
];

export function KeywordPendingEmptyState({
  copy,
  state,
}: Readonly<{
  copy: EmptyRankCopy;
  state: Exclude<KeywordCheckState, "ranked">;
}>) {
  const StatusIcon = copy.icon;
  return (
    <div className="flex flex-col items-center rounded-2xl border border-border bg-bg-elev px-6 py-12 text-center">
      <span
        className="grid h-[54px] w-[54px] place-items-center rounded-[14px] bg-bg-sunken"
        style={{
          color: state === "failed" ? "var(--red)" : "var(--yellow-text)",
        }}
      >
        <StatusIcon size={27} weight="fill" />
      </span>
      <h3 className="mt-[18px] text-lg font-semibold tracking-[-0.4px] text-fg">{copy.title}</h3>
      <p className="mt-[7px] max-w-[430px] text-[13.5px] leading-[1.55] text-fg-muted">
        {copy.body}
      </p>
      <div className="mt-6 grid w-full max-w-[560px] grid-cols-[repeat(3,1fr)] gap-3 text-left">
        {TEASERS.map(({ copy: teaserCopy, icon: TeaserIcon, title }) => (
          <div
            className="flex flex-col gap-[7px] rounded-xl border border-border bg-bg p-3.5"
            key={title}
          >
            <TeaserIcon className="text-fg-muted" size={18} />
            <span className="text-[12.5px] font-semibold text-fg">{title}</span>
            <span className="text-[11.5px] leading-[1.45] text-fg-muted">{teaserCopy}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
