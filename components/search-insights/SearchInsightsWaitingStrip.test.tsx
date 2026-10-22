import { renderWithSearchInsightsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { SearchInsightsImportState } from "@/lib/search-insights/queries/context";
import { routerMock } from "@/tests/next-navigation";
import { act, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SearchInsightsWaitingStrip } from "./SearchInsightsWaitingStrip";

const worker = {
  status: "ok" as const,
  temporalIdentityComparison: { detail: "identities match", status: "match" as const },
};

const importState = {
  capHitDays: 0,
  cursorDate: null,
  daysDone: 0,
  daysTotal: 10,
  earliestTargetDate: null,
  finalizedThroughDate: null,
  lastProbeAt: null,
  lastSyncStartedAt: null,
  newestFinalizedDate: null,
  pausedReason: null,
  plannedRetentionMonths: 16,
  state: "queued",
} satisfies SearchInsightsImportState;

function renderStrip(state: SearchInsightsImportState["state"]) {
  return render(
    <SearchInsightsWaitingStrip
      deploymentMode="self-host"
      facts={null}
      importState={{ ...importState, state }}
      projectId="prj_1"
      workerStatus={worker}
    />,
  );
}

describe("SearchInsightsWaitingStrip", () => {
  it("auto-refreshes a queued import at 90s and a running import at 45s", () => {
    vi.useFakeTimers();
    try {
      const queued = renderStrip("queued");
      expect(
        screen
          .getByRole("button", { name: "Refresh stored insights" })
          .closest("[data-auto-refresh]"),
      ).toHaveAttribute("data-auto-refresh", "active");
      act(() => vi.advanceTimersByTime(45_000));
      expect(routerMock.refresh).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(45_000));
      expect(routerMock.refresh).toHaveBeenCalledTimes(1);
      queued.unmount();
      routerMock.refresh.mockClear();

      const running = renderStrip("running");
      act(() => vi.advanceTimersByTime(44_999));
      expect(routerMock.refresh).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1));
      expect(routerMock.refresh).toHaveBeenCalledTimes(1);
      running.unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});
