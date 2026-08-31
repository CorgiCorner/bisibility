"use client";

import { trackingScheduleValueWithDepthOverride } from "@/components/keywords/add/AddKeywordDrawerExtensions";
import { TRACK_FAILED, trackDoneCopy } from "@/components/search-insights/search-insights-copy";
import { useToast } from "@/components/ui";
import type { addKeywordsMatrix } from "@/lib/actions/keyword";
import { track } from "@/lib/analytics/client";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import { trackedKey } from "@/lib/search-insights/queries/tracked-model";
import type { SerpDevice } from "@/lib/serp/markets";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";
import { SearchInsightsDrawer } from "./SearchInsightsDrawer";
import { type TrackQueryConfirm, TrackQueryDialog } from "./TrackQueryDialog";
import { SearchInsightsDrawerContext } from "./useDrawerHandlers";
import {
  type SearchInsightsDrawerActions,
  useSearchInsightsDrawers,
} from "./useSearchInsightsDrawers";
import { useTrackFocus } from "./useTrackFocus";

export type AddKeywordsMatrixAction = typeof addKeywordsMatrix;

export type SearchInsightsDrawerHostProps = SearchInsightsDrawerActions & {
  addKeywordsAction: AddKeywordsMatrixAction;
  canCreateKeyword: boolean;
  children: ReactNode;
  costContext: ProjectCostContext;
  defaultDevice: SerpDevice;
  defaultMarketKey: string | null;
  period: string;
  projectId: string;
  property: string;
  projectMarkets: ProjectMarketsView;
};

/**
 * The one drawer of the module, and the one dialog that can spend money. Both live above the
 * streamed body: the tables reach them through context, because a server-rendered subtree cannot
 * be handed callbacks.
 */
export function SearchInsightsDrawerHost({
  addKeywordsAction,
  canCreateKeyword,
  children,
  costContext,
  defaultDevice,
  defaultMarketKey,
  period,
  projectId,
  projectMarkets,
  property,
  ...actions
}: Readonly<SearchInsightsDrawerHostProps>) {
  const router = useRouter();
  const { showToast } = useToast();
  const drawers = useSearchInsightsDrawers({ ...actions, period, projectId, property });
  const focus = useTrackFocus(drawers.bodyRef);
  const [target, setTarget] = useState<string | null>(null);
  const [adding, setAdding] = useState<ReadonlySet<string>>(new Set());
  const [tracked, setTracked] = useState<ReadonlySet<string>>(new Set());
  // The chip already knows how many rows its list holds, so the frame is titled from that number
  // until the read comes back with its own total.
  const [counts, setCounts] = useState({ band: 0, overlap: 0 });
  const [namedQueryCounts, setNamedQueryCounts] = useState({ band: 0, overlap: 0 });

  async function confirm(query: string, choice: TrackQueryConfirm) {
    setTarget(null);
    // One entry per write in flight: two rows started together must each keep their own label.
    setAdding((current) => new Set(current).add(query));
    try {
      const result = await addKeywordsAction({
        devices: [choice.device],
        intent: null,
        keywords: [query],
        locations: [{ locationKey: choice.locationKey }],
        projectId,
        schedule: trackingScheduleValueWithDepthOverride(choice.schedule, {
          ...costContext,
          depth: choice.serpDepth,
        }),
        tags: [],
        targetUrl: null,
        topic: null,
      });
      // An add the project already had is still an answer to "is this tracked", so the row flips
      // either way; only a refusal leaves it as it was.
      if (result.created > 0 || result.skippedDuplicates > 0) {
        setTracked((current) => new Set([...current, trackedKey(query)]));
        const effectiveFrequency =
          choice.schedule === "project_default" ? costContext.rawFrequency : choice.schedule;
        showToast(trackDoneCopy(effectiveFrequency), { severity: "success" });
        router.refresh();
      }
    } catch (error) {
      showToast(actionErrorMessage(error, TRACK_FAILED), { severity: "error" });
    } finally {
      setAdding((current) => {
        const next = new Set(current);
        next.delete(query);
        return next;
      });
      focus.restore();
    }
  }

  /** The click that opens the dialog is also what the caret returns to once it closes. */
  function startTrack(query: string, source: "drawer" | "row") {
    focus.capture();
    setTarget(query);
    track("search_insights_track_clicked", { source });
  }

  return (
    <SearchInsightsDrawerContext.Provider
      value={{
        adding,
        openList: (which, count, namedQueryCount) => {
          setCounts((current) => ({ ...current, [which]: count }));
          setNamedQueryCounts((current) => ({ ...current, [which]: namedQueryCount }));
          drawers.open({ kind: "list", which });
        },
        openPage: (row) => drawers.open({ kind: "page", path: row.path, url: row.url }),
        openQuery: (row) => drawers.open({ kind: "query", query: row.query }),
        track: (row) => startTrack(row.query, "row"),
        tracked,
      }}
    >
      {children}
      <SearchInsightsDrawer
        adding={adding}
        back={drawers.back}
        bodyRef={drawers.bodyRef}
        canTrack={canCreateKeyword}
        counts={counts}
        entry={drawers.entry}
        frame={drawers.frame}
        namedQueryCounts={namedQueryCounts}
        onBack={drawers.pop}
        // Escape steps back out of a stack it can step back in; anything else closes the panel.
        onClose={(reason) =>
          reason === "escapeKeyDown" && drawers.back ? drawers.pop() : drawers.close()
        }
        onExited={drawers.onExited}
        onOpen={drawers.push}
        onRetry={drawers.retry}
        onShowAll={drawers.showAll}
        onTrack={(query) => startTrack(query, "drawer")}
        open={drawers.opened}
        seen={drawers.seen}
        tracked={tracked}
      />
      <TrackQueryDialog
        costContext={costContext}
        defaultDevice={defaultDevice}
        defaultMarketKey={defaultMarketKey}
        markets={projectMarkets}
        onCancel={() => setTarget(null)}
        onConfirm={(choice) => {
          if (target) void confirm(target, choice);
        }}
        query={target}
      />
    </SearchInsightsDrawerContext.Provider>
  );
}
