import { ToastProvider } from "@/components/ui";
import type { ImportObservabilityFacts } from "@/lib/search-insights/queries/import-observability";
import { setNavigationState } from "@/tests/next-navigation";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SearchInsightsWorkspace } from "./SearchInsightsWorkspace";
import type { SearchInsightsWorkspaceProps } from "./search-insights-workspace-model";

vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));

const importFacts = {
  consecutiveDays: 7,
  deepHistoryMonths: { completed: 0, target: 16 },
  lastActivityAt: "2026-08-31T10:00:00.000Z",
  lastProbeAt: "2026-08-31T10:00:00.000Z",
  qualifyingDays: 7,
  readyThrough: {
    d7: { current: true, previous: false },
    d28: { current: false, previous: false },
    d90: { current: false, previous: false },
  },
  stall: {
    expectedBatchMs: 35 * 60_000,
    expectedDayMs: 5 * 60_000,
    nextRequestInMs: 5 * 60_000,
    silenceMs: 0,
    thresholdMs: 50 * 60_000,
  },
  targetDays: 28,
} satisfies ImportObservabilityFacts;
const property = {
  displayName: "example.com",
  kind: "domain" as const,
  kindLabel: "domain",
  value: "sc-domain:example.com",
};
const context = {
  connection: { property, status: "connected" as const },
  counts: { pages: 0, queries: 0 },
  importState: {
    capHitDays: 0,
    cursorDate: "2026-08-31",
    daysDone: 7,
    daysTotal: 488,
    earliestTargetDate: "2025-04-01",
    facts: importFacts,
    finalizedThroughDate: "2026-08-31",
    lastProbeAt: "2026-08-31T10:00:00.000Z",
    lastSyncStartedAt: "2026-08-31T09:00:00.000Z",
    newestFinalizedDate: "2026-08-31",
    pausedReason: null,
    state: "running",
  },
  organicSessions: { importState: null, property: null, status: "not_connected" as const },
  period: { days: 7, id: "7" as const, label: "7 finalized days", sub: "vs previous 7" },
  projectDomain: "example.com",
  selectedProperty: property,
  view: "active" as const,
  window: {
    current: { end: "2026-08-31", start: "2026-08-25" },
    previous: { end: "2026-08-24", start: "2026-08-18" },
  },
  yoy: { monthsImported: 0, required: 13 },
} satisfies SearchInsightsWorkspaceProps["context"];

function renderWorkspace() {
  setNavigationState({
    pathname: "/app/prj_1/search-console",
    searchParams: { period: "7" },
  });
  return render(
    <ToastProvider>
      <SearchInsightsWorkspace
        cancelPropertySelectionAction={vi.fn()}
        completePropertySelectionAction={vi.fn()}
        context={context}
        disconnectConnectionAction={vi.fn()}
        exportAction={vi.fn()}
        loadPropertiesAction={vi.fn()}
        oauth={{ error: null, provider: null, setup: null }}
        projectDomain="example.com"
        projectId="prj_1"
        selectPropertyAction={vi.fn()}
        syncAction={vi.fn()}
      />
    </ToastProvider>,
  );
}

describe("SearchInsightsWorkspace period readiness", () => {
  it("disables unavailable periods and gives their pace-derived readiness ETA", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getByRole("button", { name: "Comparison window" }));

    const menu = screen.getByRole("listbox", { name: "Comparison window" });
    const seven = within(menu).getByRole("option", { name: /7 finalized days/i });
    const twentyEight = within(menu).getByRole("option", { name: /28 finalized days/i });
    const ninety = within(menu).getByRole("option", { name: /90 finalized days/i });
    expect(seven).not.toHaveAttribute("aria-disabled");
    expect(twentyEight).toHaveAttribute("aria-disabled", "true");
    expect(twentyEight).toHaveTextContent("vs previous 28 / ready in ~2 hr");
    expect(ninety).toHaveAttribute("aria-disabled", "true");
    expect(ninety).toHaveTextContent("vs previous 90 / ready in ~7 hr");
  });
});
