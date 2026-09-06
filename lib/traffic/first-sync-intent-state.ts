export const FIRST_TRAFFIC_SYNC_STALE_CLAIM_MINUTES = 35;

type FirstSyncConnectionState = {
  enabled: boolean;
  kind: string;
  status: string;
};

export type FirstSyncIntentFields = {
  firstSyncFinishedAt: null;
  firstSyncRequestedAt: Date;
  firstSyncStartedAt: null;
};

function isEnabledConnectedAnalytics(connection: FirstSyncConnectionState | null) {
  return (
    connection?.enabled === true &&
    connection.kind === "analytics" &&
    connection.status === "connected"
  );
}

export function firstSyncIntentOnConnect(
  before: FirstSyncConnectionState | null,
  after: FirstSyncConnectionState,
  now = new Date(),
): FirstSyncIntentFields | Record<never, never> {
  if (!isEnabledConnectedAnalytics(after) || isEnabledConnectedAnalytics(before)) return {};
  return {
    firstSyncFinishedAt: null,
    firstSyncRequestedAt: now,
    firstSyncStartedAt: null,
  };
}

export function firstTrafficSyncClaimStaleBefore(now: Date) {
  return new Date(now.getTime() - FIRST_TRAFFIC_SYNC_STALE_CLAIM_MINUTES * 60 * 1000);
}
