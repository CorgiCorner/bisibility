"use client";

import {
  type GetRankCheckStatusesResult,
  getRankCheckStatuses,
} from "@/lib/actions/rank-check-status";
import { useCallback, useRef, useSyncExternalStore } from "react";

export type RankCheckBatchPollAction = (input: {
  projectId: string;
  rankCheckIds: string[];
}) => Promise<GetRankCheckStatusesResult[]>;

type Input = {
  onTerminal: (result: GetRankCheckStatusesResult) => void;
  pollAction?: RankCheckBatchPollAction;
  projectId: string;
  rankCheckIds: string[];
};

const POLL_CHUNK_SIZE = 100;
const terminalStatuses = new Set(["completed", "deferred", "failed"]);
const serverSnapshot = () => 0;

function chunks(ids: string[]) {
  const result: string[][] = [];
  for (let offset = 0; offset < ids.length; offset += POLL_CHUNK_SIZE) {
    result.push(ids.slice(offset, offset + POLL_CHUNK_SIZE));
  }
  return result;
}

function unavailable(rankCheckId: string): GetRankCheckStatusesResult {
  return {
    error: "The rank check status could not be confirmed after repeated attempts.",
    errorCode: "status_unavailable",
    finishedAt: null,
    position: null,
    rankCheckId,
    requestedDepth: null,
    status: "failed",
  };
}

export function useRankCheckBatchPoll({
  onTerminal,
  pollAction = getRankCheckStatuses,
  projectId,
  rankCheckIds,
}: Readonly<Input>) {
  const inputRef = useRef({ onTerminal, pollAction, projectId, rankCheckIds });
  inputRef.current = { onTerminal, pollAction, projectId, rankCheckIds };
  const versionRef = useRef(0);

  const subscribe = useCallback(
    (notify: () => void) => {
      let cancelled = false;
      let consecutiveRejectedCycles = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const terminalized = new Set<string>();

      async function tick() {
        const current = inputRef.current;
        const outstanding = current.rankCheckIds.filter((id) => !terminalized.has(id));
        if (outstanding.length === 0) return;
        try {
          const chunkResults = await Promise.all(
            chunks(outstanding).map((rankCheckIds) =>
              current.pollAction({ projectId: current.projectId, rankCheckIds }),
            ),
          );
          if (cancelled) return;
          consecutiveRejectedCycles = 0;
          const results = chunkResults.flat();
          const returnedIds = new Set(results.map((result) => result.rankCheckId));
          for (const result of results) {
            if (terminalStatuses.has(result.status) && !terminalized.has(result.rankCheckId)) {
              terminalized.add(result.rankCheckId);
              current.onTerminal(result);
            }
          }
          for (const rankCheckId of outstanding) {
            if (!returnedIds.has(rankCheckId) && !terminalized.has(rankCheckId)) {
              terminalized.add(rankCheckId);
              current.onTerminal({
                error: "The rank check is no longer available.",
                errorCode: "not_found",
                finishedAt: null,
                position: null,
                rankCheckId,
                requestedDepth: null,
                status: "failed",
              });
            }
          }
          versionRef.current += 1;
          notify();
          if (outstanding.some((id) => !terminalized.has(id))) timer = setTimeout(tick, 5000);
        } catch {
          if (cancelled) return;
          consecutiveRejectedCycles += 1;
          // Server Action failures do not reliably expose transport or server classification.
          if (consecutiveRejectedCycles >= 3) {
            for (const rankCheckId of outstanding) {
              if (terminalized.has(rankCheckId)) continue;
              terminalized.add(rankCheckId);
              current.onTerminal(unavailable(rankCheckId));
            }
            return;
          }
          timer = setTimeout(tick, 5000 * consecutiveRejectedCycles);
        }
      }
      if (rankCheckIds.length > 0) timer = setTimeout(tick, 2000);
      return () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
      };
    },
    [rankCheckIds],
  );

  useSyncExternalStore(subscribe, () => versionRef.current, serverSnapshot);
}
