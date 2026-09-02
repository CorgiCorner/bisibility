import { type RankTrackerTab, rankTrackerTabPath } from "@/lib/routing/app-path";
import { cn } from "@/lib/ui/cn";
import Link from "next/link";

type RankTrackerTabsProps = {
  activeTab: RankTrackerTab;
  checksCount: number;
  projectRef: string;
  savedCount: number;
  trackedCount: number;
};

const compactCount = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  notation: "compact",
});

function formatCount(value: number) {
  return compactCount.format(value).toLowerCase();
}

function countChip() {
  return "rounded-control bg-bg-sunken px-[7px] py-0.5 font-sans tabular-nums text-[11px] text-fg-muted";
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
  checksCount,
  projectRef,
  savedCount,
  trackedCount,
}: Readonly<RankTrackerTabsProps>) {
  const trackedActive = activeTab === "tracked";
  const savedActive = activeTab === "saved";
  const checksActive = activeTab === "checks";

  return (
    <nav aria-label="Rank Tracker views" className="flex gap-1 border-b border-border">
      <Link
        aria-current={trackedActive ? "page" : undefined}
        aria-label={`Tracked ${trackedCount}`}
        className={tabClass(trackedActive)}
        href={rankTrackerTabPath(projectRef, "tracked")}
      >
        <span>Tracked</span>
        <span className={countChip()}>{trackedCount.toLocaleString("en-US")}</span>
      </Link>
      <Link
        aria-current={savedActive ? "page" : undefined}
        aria-label={`Saved ${savedCount}`}
        className={tabClass(savedActive)}
        href={rankTrackerTabPath(projectRef, "saved")}
      >
        <span>Saved</span>
        <span className={countChip()}>{savedCount.toLocaleString("en-US")}</span>
      </Link>
      <Link
        aria-current={checksActive ? "page" : undefined}
        aria-label={`Checks ${checksCount}`}
        className={tabClass(checksActive)}
        href={rankTrackerTabPath(projectRef, "checks")}
      >
        <span>Checks</span>
        <span className={countChip()}>{formatCount(checksCount)}</span>
      </Link>
    </nav>
  );
}
