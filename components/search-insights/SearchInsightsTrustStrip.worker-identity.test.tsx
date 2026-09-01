import type { SearchInsightsImportState } from "@/lib/search-insights/queries/context";
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { SearchInsightsTrustStrip } from "./SearchInsightsTrustStrip";

const importState: SearchInsightsImportState = {
  capHitDays: 0,
  cursorDate: "2026-03-14",
  daysDone: 274,
  daysTotal: 488,
  earliestTargetDate: "2025-03-14",
  finalizedThroughDate: "2026-07-08",
  lastProbeAt: "2026-08-29T17:00:00.000Z",
  lastSyncStartedAt: null,
  newestFinalizedDate: "2026-07-08",
  pausedReason: null,
  plannedRetentionMonths: 16,
  state: "running",
};

const mismatchWorkerHealth = {
  status: "ok" as const,
  temporalIdentityComparison: {
    detail:
      "app (namespace: production, queue: search-insights) != worker (namespace: staging, queue: search-insights-v2)",
    status: "mismatch" as const,
  },
};

function renderWaitingStrip(
  deploymentMode: "cloud" | "self-host",
  overrides: Partial<Parameters<typeof SearchInsightsTrustStrip>[0]> = {},
) {
  return render(
    <SearchInsightsTrustStrip
      coverage={{ calculable: false, capHitDays: 0, clicksShare: 0, impressionsShare: 0 }}
      deploymentMode={deploymentMode}
      importState={importState}
      incidents={[]}
      localViewReady={false}
      providerAvailabilitySource={null}
      providerAvailableThrough={null}
      workerStatus={mismatchWorkerHealth}
      {...overrides}
    />,
  );
}

it.each(["self-host", "cloud"] as const)(
  "suppresses the %s process strip before the first view",
  (deploymentMode) => {
    const { container } = renderWaitingStrip(deploymentMode);
    expect(screen.queryByRole("region", { name: "Data provenance" })).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/worker|temporal|namespace|queue|restart|paused/i);
  },
);

it("suppresses duplicate user-pause ownership before the first view", () => {
  renderWaitingStrip("self-host", {
    importState: { ...importState, pausedReason: "user", state: "paused" },
  });
  expect(screen.queryByRole("region", { name: "Data provenance" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Resume/ })).not.toBeInTheDocument();
});
