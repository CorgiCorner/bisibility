import "server-only";

import { prisma } from "@/lib/db/prisma";
import { emitSignal } from "@/lib/signals/emit";
import { type AlertDepthConflict, DEPTH_CONFLICT_SIGNAL_TYPE } from "./depth-conflict";

type DepthConflictSignalInput = {
  checkedAt?: Date;
  conflict: AlertDepthConflict;
  keywordId: string;
  projectId: string;
  rankingUrl?: string | null;
  ruleId: string;
};

export async function emitDepthConflictSignal(input: DepthConflictSignalInput) {
  const existing = await prisma.signal.findFirst({
    select: { id: true },
    where: {
      keywordId: input.keywordId,
      payload: { equals: input.ruleId, path: ["ruleId"] },
      projectId: input.projectId,
      type: DEPTH_CONFLICT_SIGNAL_TYPE,
    },
  });
  if (existing) return existing;

  return emitSignal({
    happenedAt: input.checkedAt,
    keywordId: input.keywordId,
    payload: {
      requestedDepth: input.conflict.trackedDepth,
      ruleId: input.ruleId,
      threshold: input.conflict.threshold,
    },
    projectId: input.projectId,
    severity: "warning",
    source: "rank_tracker",
    type: DEPTH_CONFLICT_SIGNAL_TYPE,
    url: input.rankingUrl,
  });
}
