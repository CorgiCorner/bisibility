"use client";

import type { GetRankCheckStatusesResult } from "@/lib/actions/rank-check-status";
import { useState } from "react";
import { type RankCheckBatchPollAction, useRankCheckBatchPoll } from "./use-rank-check-batch-poll";

type Input = {
  initialCompleted?: number;
  onTerminal?: (result: GetRankCheckStatusesResult) => void;
  pollAction?: RankCheckBatchPollAction;
  projectId: string;
  rankCheckIds: string[];
  total: number;
};

export function useRankCheckBatchProgress({
  initialCompleted = 0,
  onTerminal,
  pollAction,
  projectId,
  rankCheckIds,
  total,
}: Readonly<Input>) {
  const [completed, setCompleted] = useState(initialCompleted);

  useRankCheckBatchPoll({
    onTerminal: (result) => {
      if (result.status === "completed") setCompleted((current) => current + 1);
      onTerminal?.(result);
    },
    ...(pollAction ? { pollAction } : {}),
    projectId,
    rankCheckIds,
  });

  return { completed, total };
}
