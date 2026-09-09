"use client";

import type {
  ProviderActionHandlers,
  ProviderTestResult,
  ProviderTrafficSyncResult,
} from "@/lib/integrations/types";
import { useState } from "react";

const demoTrafficSync = async (): Promise<ProviderTrafficSyncResult> => ({
  connections: 1,
  keywordSnapshots: 12,
  pageSnapshots: 4,
  runs: [{ status: "succeeded_with_data" }],
});

export function useProviderTrafficSync({
  projectId,
  readOnly,
  syncProjectTraffic = demoTrafficSync,
}: {
  projectId?: string;
  readOnly: boolean;
  syncProjectTraffic?: ProviderActionHandlers["syncProjectTraffic"];
}) {
  const [syncPending, setSyncPending] = useState(false);
  const [syncResult, setSyncResult] = useState<ProviderTestResult | null>(null);

  async function handleTrafficSync() {
    if (readOnly) return;
    setSyncPending(true);
    setSyncResult(null);
    try {
      const result = await syncProjectTraffic({ projectId: projectId ?? "prj_storybook" });
      const failures = result.runs.filter((run) => run.status === "failed").length;
      setSyncResult({
        message:
          failures > 0 && result.connections === 0
            ? "No analytics source completed. Check the provider credentials and worker logs."
            : `${result.keywordSnapshots} keyword and ${result.pageSnapshots} page snapshots updated.`,
        ok: failures === 0 || result.connections > 0,
      });
    } catch (error) {
      setSyncResult({
        message: error instanceof Error ? error.message : "Traffic sync failed.",
        ok: false,
      });
    } finally {
      setSyncPending(false);
    }
  }
  return { handleTrafficSync, syncPending, syncResult };
}
