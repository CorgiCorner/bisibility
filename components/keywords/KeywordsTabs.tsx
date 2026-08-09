import { appPath } from "@/lib/routing/app-path";
import { cn } from "@/lib/ui/cn";
import {
  BookmarkSimpleIcon as BookmarkSimple,
  ChartLineUpIcon as ChartLineUp,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

export type KeywordsTab = "saved" | "tracked";

type KeywordsTabsProps = {
  activeTab: KeywordsTab;
  projectRef: string;
  savedCount: number;
  trackedCount: number;
};

function countChip(active: boolean) {
  return cn(
    "rounded-md bg-bg-sunken px-[7px] py-0.5 font-mono text-[11px]",
    active ? "text-fg-muted" : "text-fg-muted",
  );
}

function tabClass(active: boolean) {
  return cn(
    "-mb-px flex items-center gap-2 border-b-2 px-3.5 py-[9px] text-[13.5px] transition-colors",
    active
      ? "border-accent font-semibold text-fg"
      : "border-transparent text-fg-muted hover:text-fg",
  );
}

export function KeywordsTabs({
  activeTab,
  projectRef,
  savedCount,
  trackedCount,
}: Readonly<KeywordsTabsProps>) {
  const trackedActive = activeTab === "tracked";
  const savedActive = activeTab === "saved";

  return (
    <nav aria-label="Keyword lists" className="flex gap-1 border-b border-border-strong">
      <Link
        aria-current={trackedActive ? "page" : undefined}
        aria-label={`Tracked ${trackedCount}`}
        className={tabClass(trackedActive)}
        href={appPath(projectRef, "keywords")}
      >
        <ChartLineUp size={14} weight={trackedActive ? "bold" : "regular"} />
        <span>Tracked</span>
        <span className={countChip(trackedActive)}>{trackedCount.toLocaleString("en-US")}</span>
      </Link>
      <Link
        aria-current={savedActive ? "page" : undefined}
        aria-label={`Saved ${savedCount}`}
        className={tabClass(savedActive)}
        href={`${appPath(projectRef, "keywords")}?tab=saved`}
      >
        <BookmarkSimple
          className={savedActive ? "text-accent-text" : undefined}
          data-testid="saved-tab-icon"
          data-weight={savedActive ? "fill" : "regular"}
          size={14}
          weight={savedActive ? "fill" : "regular"}
        />
        <span>Saved</span>
        <span className={countChip(savedActive)}>{savedCount.toLocaleString("en-US")}</span>
      </Link>
    </nav>
  );
}
