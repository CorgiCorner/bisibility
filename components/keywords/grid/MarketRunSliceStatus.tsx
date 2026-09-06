"use client";

import {
  dismissRankRunNotice,
  isInRankRunNoticeDismissalSnapshot,
  type RankRunNoticeIdentity,
  useRankRunNoticeDismissalSnapshot,
} from "@/components/rank-runs/notice-dismissals";
import { Button } from "@/components/ui";
import { appPath } from "@/lib/routing/app-path";
import Link from "next/link";
import { useMemo } from "react";

type Props = {
  marketLabel: string;
  projectRef: string;
  runId: string;
};

/**
 * A notification can land a reader inside ONE market on a run that spanned several. Saying so
 * is the whole job: the reader is never moved, and the row is not a standing banner, because
 * the fact is about this arrival and not about the state of the project. The acknowledgement
 * is keyed by the run, so the row is stated once per run rather than once per render, and a
 * different run still gets its own sentence.
 */
export function MarketRunSliceStatus({ marketLabel, projectRef, runId }: Readonly<Props>) {
  const identity = useMemo<RankRunNoticeIdentity>(() => ({ kind: "market-slice", runId }), [runId]);
  const notices = useMemo(() => [identity], [identity]);
  const snapshot = useRankRunNoticeDismissalSnapshot(notices);

  if (isInRankRunNoticeDismissalSnapshot(snapshot, identity)) {
    return null;
  }

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-control border border-border bg-bg-sunken px-3 py-2 text-[12.5px] leading-[1.5] text-fg-muted"
      data-testid="market-run-slice"
      key={runId}
      role="status"
    >
      <span className="min-w-0">
        You opened this run inside {marketLabel}. It also ran in other markets, which this page does
        not show.
      </span>
      <span className="ml-auto flex flex-wrap items-center gap-2">
        <Button
          component={Link}
          href={`${appPath(projectRef, "rank-tracker")}?run=${encodeURIComponent(runId)}`}
          size="xs"
          variant="secondary"
        >
          View all markets
        </Button>
        <Button onClick={() => dismissRankRunNotice(identity)} size="xs" variant="ghost">
          Stay in {marketLabel}
        </Button>
      </span>
    </div>
  );
}
