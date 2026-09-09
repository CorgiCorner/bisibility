import type { RankCheckOperation } from "@/lib/rank-check/runs/contract";

export type RunsSegment = "history" | "planned";

export type RankRunRecord = RankCheckOperation & {
  checkScheduleArchived?: boolean;
  checkScheduleName?: string | null;
  checkSchedulePublicId?: string | null;
  launchedAt: string | null;
  requestedBy?: {
    avatarUrl?: string | null;
    initials?: string;
    name: string | null;
  } | null;
  skippedBy?: {
    avatarUrl?: string | null;
    initials?: string;
    name: string | null;
  } | null;
};

export type RankRunPage = {
  data: RankRunRecord[];
  nextCursor: string | null;
};
