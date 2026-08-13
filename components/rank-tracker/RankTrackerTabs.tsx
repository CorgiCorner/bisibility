import { type RankTrackerTab, rankTrackerTabPath } from "@/lib/routing/app-path";
import { cn } from "@/lib/ui/cn";
import {
  BookmarkSimpleIcon as BookmarkSimple,
  ChartLineUpIcon as ChartLineUp,
  PulseIcon as Pulse,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

type RankTrackerTabsProps = {
  activeTab: RankTrackerTab;
  projectRef: string;
  savedCount: number;
  trackedCount: number;
};

function countChip() {
  return "rounded-md bg-bg-sunken px-[7px] py-0.5 font-mono text-[11px] text-fg-muted";
}

function tabClass(active: boolean) {
  return cn(
    "-mb-px flex items-center gap-2 border-b-2 px-3.5 py-[9px] text-[13.5px] transition-colors",
    active
      ? "border-accent font-semibold text-fg"
      : "border-transparent text-fg-muted hover:text-fg",
  );
}

export function RankTrackerTabs({
  activeTab,
  projectRef,
  savedCount,
  trackedCount,
}: Readonly<RankTrackerTabsProps>) {
  const trackedActive = activeTab === "tracked";
  const savedActive = activeTab === "saved";
  const checksActive = activeTab === "checks";

  return (
    <nav aria-label="Rank Tracker views" className="flex gap-1 border-b border-border-strong">
      <Link
        aria-current={trackedActive ? "page" : undefined}
        aria-label={`Tracked ${trackedCount}`}
        className={tabClass(trackedActive)}
        href={rankTrackerTabPath(projectRef, "tracked")}
      >
        <ChartLineUp size={14} weight={trackedActive ? "bold" : "regular"} />
        <span>Tracked</span>
        <span className={countChip()}>{trackedCount.toLocaleString("en-US")}</span>
      </Link>
      <Link
        aria-current={savedActive ? "page" : undefined}
        aria-label={`Saved ${savedCount}`}
        className={tabClass(savedActive)}
        href={rankTrackerTabPath(projectRef, "saved")}
      >
        <BookmarkSimple
          className={savedActive ? "text-accent-text" : undefined}
          data-testid="saved-tab-icon"
          data-weight={savedActive ? "fill" : "regular"}
          size={14}
          weight={savedActive ? "fill" : "regular"}
        />
        <span>Saved</span>
        <span className={countChip()}>{savedCount.toLocaleString("en-US")}</span>
      </Link>
      <Link
        aria-current={checksActive ? "page" : undefined}
        className={tabClass(checksActive)}
        href={rankTrackerTabPath(projectRef, "checks")}
      >
        <Pulse size={14} weight={checksActive ? "bold" : "regular"} />
        <span>Checks</span>
      </Link>
    </nav>
  );
}
