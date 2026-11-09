import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { queueAnalyticsDataSynced } from "./analytics-data-synced";

type Scope = {
  connectionId?: string;
  projectId: string;
  provider: "gsc" | "ga4";
  rowsStored: number;
  trigger: "manual" | "scheduled" | "api" | "unknown";
};
const scopes = new AsyncLocalStorage<Scope>();

export function setAnalyticsSyncConnection(connectionId: string) {
  const scope = scopes.getStore();
  if (scope) scope.connectionId = connectionId;
}

export function noteAnalyticsRowsStored(rows: number) {
  const scope = scopes.getStore();
  if (scope && rows > 0) scope.rowsStored += rows;
}

export async function withAnalyticsSyncScope<T>(
  input: Pick<Scope, "projectId" | "provider" | "trigger">,
  operation: () => Promise<T>,
  succeeded: (result: T) => boolean,
): Promise<T> {
  const scope: Scope = { ...input, rowsStored: 0 };
  return scopes.run(scope, async () => {
    const result = await operation();
    if (scope.connectionId && scope.rowsStored > 0 && succeeded(result)) {
      queueAnalyticsDataSynced({ ...scope, connectionId: scope.connectionId });
    }
    return result;
  });
}
