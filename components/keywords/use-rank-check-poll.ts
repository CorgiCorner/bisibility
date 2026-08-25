"use client";

import { type GetRankCheckStatusResult, getRankCheckStatus } from "@/lib/actions/rank-check-status";
import { useEffect, useRef } from "react";

export type RankCheckPollAction = (input: {
  rankCheckId: string;
}) => Promise<GetRankCheckStatusResult>;

type UseRankCheckPollInput = {
  onTerminal: (result: GetRankCheckStatusResult) => void;
  pollAction?: RankCheckPollAction;
  rankCheckId: string | null;
};

function isTerminal(status: string) {
  return status === "completed" || status === "failed" || status === "deferred";
}

export function useRankCheckPoll({
  onTerminal,
  pollAction = getRankCheckStatus,
  rankCheckId,
}: Readonly<UseRankCheckPollInput>) {
  const onTerminalRef = useRef(onTerminal);
  onTerminalRef.current = onTerminal;

  // Polling is synchronization with the persisted rank check run.
  useEffect(() => {
    if (!rankCheckId) return undefined;
    const id = rankCheckId;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function tick() {
      try {
        const result = await pollAction({ rankCheckId: id });
        if (cancelled) return;
        if (isTerminal(result.status)) {
          onTerminalRef.current(result);
          return;
        }
        timer = setTimeout(tick, 5000);
      } catch {
        if (cancelled) return;
        timer = setTimeout(tick, 5000);
      }
    }

    timer = setTimeout(tick, 2000);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [rankCheckId, pollAction]);
}
