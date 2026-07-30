import { deferredReasonLabel, keywordLabel, projectLabel } from "@/lib/ops/labels";
import { notifyOps } from "@/lib/ops/notify";

type RankCheckTiming = {
  scheduledAt: Date | null;
  startedAt: Date | null;
};

type FailedRankCheckOpsInput = RankCheckTiming & {
  keywordId: string;
  keywordText: string;
  projectId: string;
  provider: string;
  providerAttemptCount: number | null;
};

type DeferredRankCheckOpsInput = RankCheckTiming & {
  keywordId: string;
  keywordText: string;
  projectId: string;
  provider: string;
  reason: string;
};

function timingFields(timing: RankCheckTiming) {
  const scheduledAt = timing.scheduledAt?.toISOString() ?? "manual";
  const startedAt = timing.startedAt?.toISOString() ?? "unknown";
  const lagMs =
    timing.scheduledAt && timing.startedAt
      ? Math.max(0, timing.startedAt.getTime() - timing.scheduledAt.getTime())
      : null;
  return {
    "Scheduled for": scheduledAt,
    "Start lag": lagMs === null ? "n/a" : `${lagMs} ms`,
    "Started at": startedAt,
  };
}

async function safelyNotify(input: Parameters<typeof notifyOps>[0]) {
  await notifyOps(input).catch(() => {
    console.error("[ops] rank check notification failed");
  });
}

export async function notifyFailedRankCheckOps(input: FailedRankCheckOpsInput) {
  await safelyNotify({
    dedupeKey: `rank:${input.keywordId}:${input.provider}`,
    fields: {
      Error: "rank_check_failed",
      Keyword: keywordLabel(input.keywordId, input.keywordText),
      Project: projectLabel(input.projectId),
      Provider: input.provider,
      "Provider attempts": input.providerAttemptCount ?? "not recorded",
      ...timingFields(input),
    },
    kind: "rank_check",
    severity: "error",
    title: "Rank check failed",
  });
}

export async function notifyDeferredRankCheckOps(input: DeferredRankCheckOpsInput) {
  const reason = deferredReasonLabel(input.reason);
  await safelyNotify({
    dedupeKey: `defer:${input.projectId}:${reason}`,
    fields: {
      Keyword: keywordLabel(input.keywordId, input.keywordText),
      Project: projectLabel(input.projectId),
      Provider: input.provider,
      Reason: reason,
      ...timingFields(input),
    },
    kind: "rank_check_deferred",
    severity: "warning",
    title: "Rank check deferred",
  });
}
