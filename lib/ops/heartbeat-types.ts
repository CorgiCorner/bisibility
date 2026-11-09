import type { RankDispatchHeartbeat } from "./heartbeat-dispatch-data";
import type { HeartbeatEvidenceCounts } from "./heartbeat-evidence";
import type { RankScheduleHeartbeat } from "./heartbeat-schedule-data";
import type { TrafficHeartbeatRow } from "./heartbeat-traffic-data";

export type RankHeartbeat = {
  evidenceCounts?: HeartbeatEvidenceCounts;
  deferredReasons?: Record<string, number>;
  deferred: number;
  failed: number;
  lagP50Ms: number | null;
  lagP95Ms: number | null;
  recentFailures?: AdminRankFailure[];
  recentFallbacks?: AdminRankFailure[];
  scheduled: number;
  stuck: number;
  succeeded: number;
  topFailures: string[];
};

export type AdminRankFailure = {
  errorSummary: string;
  occurredAt: string;
  projectId: string;
  provider: string;
};

export type AdminRankHeartbeat = RankHeartbeat & {
  recentFailures: AdminRankFailure[];
  recentFallbacks: AdminRankFailure[];
};

export type { TrafficHeartbeatRow };

export type DatabaseHeartbeat = {
  bootstrapErrors: string[];
  collectionAvailable: boolean;
  dispatch: RankDispatchHeartbeat | null;
  rank: RankHeartbeat;
  schedule: RankScheduleHeartbeat;
  traffic: TrafficHeartbeatRow[];
  undeliveredEvents: number;
};

export type OperationalHeartbeat = Omit<
  DatabaseHeartbeat,
  "collectionAvailable" | "dispatch" | "rank" | "schedule"
>;
