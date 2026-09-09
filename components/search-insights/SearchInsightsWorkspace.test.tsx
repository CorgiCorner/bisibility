import { ToastProvider } from "@/components/ui/Toast";
import { validateEventProps } from "@/lib/analytics/event-schemas";
import { WINDOW_PRESETS } from "@/lib/search-insights/constants";
import { routerMock, setNavigationState } from "@/tests/next-navigation";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchInsightsWorkspace } from "./SearchInsightsWorkspace";
import type { SearchInsightsWorkspaceProps } from "./search-insights-workspace-model";

const mocks = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@/lib/analytics/client", () => ({ track: mocks.track }));

const readyFacts = {
  consecutiveDays: 10,
  deepHistoryMonths: { completed: 0, target: 16 },
  lastActivityAt: null,
  lastProbeAt: null,
  qualifyingDays: 10,
  readyThrough: {
    d1: { current: true, previous: true },
    d7: { current: true, previous: false },
    d28: { current: false, previous: false },
    d90: { current: false, previous: false },
  },
  stall: {
    expectedBatchMs: 1,
    expectedDayMs: 1,
    nextRequestInMs: 0,
    silenceMs: 0,
    thresholdMs: 1,
  },
  targetDays: 28,
} as const;

const context = {
  connection: {
    property: {
      displayName: "example.com",
      kind: "domain" as const,
      kindLabel: "domain",
      value: "sc-domain:example.com",
    },
    status: "connected" as const,
  },
  counts: { queries: 1284 },
  importState: null,
  organicSessions: {
    importState: null,
    keyEventsConfigured: null,
    property: null,
    status: "not_connected" as const,
  },
  projectDomain: "example.com",
  selectedProperty: {
    displayName: "example.com",
    kind: "domain" as const,
    kindLabel: "domain",
    value: "sc-domain:example.com",
  },
  view: "active" as const,
  period: {
    comparison: "previous_period" as const,
    days: 28,
    id: "28" as const,
    label: "28 finalized days",
  },
  window: {
    current: { end: "2026-07-08", start: "2026-06-11" },
    previous: { end: "2026-06-10", start: "2026-05-14" },
  },
  yoy: { monthsImported: 9, required: 13 },
};

function renderWorkspace(
  overrides: Partial<SearchInsightsWorkspaceProps> = {},
  searchParams = { period: "28" } as Record<string, string>,
) {
  setNavigationState({
    pathname: "/app/prj_1/search-console",
    searchParams,
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
        trustStrip={null}
        {...overrides}
      />
    </ToastProvider>,
  );
}

describe("SearchInsightsWorkspace", () => {
  beforeEach(() => {
    mocks.track.mockReset();
    mocks.track.mockImplementation((event, props) => validateEventProps(event, props));
  });

  it.each(WINDOW_PRESETS.filter(({ id }) => id !== "28"))(
    "validates analytics and shows skeletons when changing to $id days",
    async ({ id, label }) => {
      const user = userEvent.setup();
      let completeNavigation = () => {};
      const navigation = new Promise<void>((resolve) => {
        completeNavigation = resolve;
      });
      routerMock.replace.mockReturnValue(navigation);
      renderWorkspace(
        {
          children: <p>Current metrics and tables</p>,
          trustStrip: <p>Current coverage</p>,
        },
        {
          period: "28",
          property: "sc-domain:example.com",
          comparison: "previous_period",
        },
      );

      await user.click(screen.getByRole("button", { name: /^Comparison window:/ }));
      await user.click(await screen.findByRole("option", { name: (name) => name.includes(label) }));

      expect(
        await screen.findByRole("region", { name: "Search Console data loading" }),
      ).toHaveAttribute("aria-busy", "true");
      expect(screen.queryByText("Current metrics and tables")).not.toBeInTheDocument();
      expect(screen.queryByText("Current coverage")).not.toBeInTheDocument();
      const trigger = screen.getByRole("button", { name: /^Comparison window:/ });
      expect(trigger).toBeDisabled();
      expect(trigger.querySelector(".animate-spin")).toBeNull();
      expect(screen.getByRole("button", { name: "Search Console property" })).toBeVisible();
      expect(routerMock.replace).toHaveBeenCalledWith(
        `/app/prj_1/search-console?period=${id}&property=sc-domain%3Aexample.com&comparison=previous_period`,
        { scroll: false },
      );
      expect(mocks.track).toHaveBeenCalledWith("search_insights_period_changed", { window: id });

      await act(async () => completeNavigation());
      await waitFor(() =>
        expect(
          screen.queryByRole("region", { name: "Search Console data loading" }),
        ).not.toBeInTheDocument(),
      );
      expect(screen.getByText("Current metrics and tables")).toBeVisible();
      expect(screen.getByText("Current coverage")).toBeVisible();
      expect(trigger).toBeEnabled();
    },
  );

  it("reports one module view for its workspace mount", () => {
    renderWorkspace();

    expect(mocks.track).toHaveBeenCalledTimes(1);
    expect(mocks.track).toHaveBeenCalledWith("search_insights_module_viewed");
  });

  it("puts the property, the window and both actions on one context bar", () => {
    renderWorkspace();

    const bar = screen.getByRole("button", { name: "Search Console property" }).closest("div");
    expect(bar).not.toBeNull();
    const labels = [...(bar?.querySelectorAll("button") ?? [])].map((button) =>
      (button.getAttribute("aria-label") ?? button.textContent ?? "").trim(),
    );
    expect(labels).toEqual([
      "Search Console property",
      "Comparison window: Jun 11 - Jul 8",
      "Export CSV (1,284 rows)",
      "Refresh stored insights",
      "Sync now",
    ]);
  });

  it("passes the finalized window to the period chip", () => {
    renderWorkspace();

    expect(
      screen.getByRole("button", {
        name: "Comparison window: Jun 11 - Jul 8",
      }),
    ).toHaveTextContent("Jun 11 - Jul 8");
  });

  it("does not render the context card until a property is selected", () => {
    const { container } = renderWorkspace({
      context: {
        ...context,
        connection: { property: null, status: "connected_no_property" },
        counts: { queries: 0 },
      },
    });

    expect(container.querySelector("section")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Comparison window:/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Export CSV/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sync now" })).toBeNull();
  });

  // The strip owns its own divider. A `<Suspense>` element is truthy even when the strip inside
  // it resolves to nothing, so a divider painted from the card would outlive its child.
  it("renders the provenance strip unwrapped and the module body below the card", () => {
    const { container } = renderWorkspace({
      children: <p>Module body</p>,
      trustStrip: <p>Google data available through Jul 8</p>,
    });

    const strip = screen.getByText("Google data available through Jul 8");
    expect(strip.parentElement).not.toHaveClass("border-t");
    expect(container.querySelectorAll(".border-t")).toHaveLength(0);
    expect(screen.getByText("Module body")).toBeInTheDocument();
  });

  it("leaves no empty divider while the provenance strip is absent", () => {
    const { container } = renderWorkspace();

    expect(container.querySelectorAll(".border-t")).toHaveLength(0);
  });

  it("reloads property choices when the active property changes in the same workspace", async () => {
    const activeA = context.connection.property;
    const activeB = {
      displayName: "blog.example.com",
      kind: "domain" as const,
      kindLabel: "domain",
      value: "sc-domain:blog.example.com",
    };
    const loadPropertiesAction = vi
      .fn()
      .mockResolvedValueOnce({ properties: [{ ...activeA, permissionLevel: "siteOwner" }] })
      .mockResolvedValueOnce({
        archived: [{ ...activeA, lastSyncedDate: "2026-08-26" }],
        properties: [{ ...activeB, permissionLevel: "siteOwner" }],
      });
    const workspace = (activeProperty: typeof activeA) => (
      <ToastProvider>
        <SearchInsightsWorkspace
          cancelPropertySelectionAction={vi.fn()}
          completePropertySelectionAction={vi.fn()}
          context={{
            ...context,
            connection: { property: activeProperty, status: "connected" },
            selectedProperty: activeProperty,
          }}
          disconnectConnectionAction={vi.fn()}
          exportAction={vi.fn()}
          loadPropertiesAction={loadPropertiesAction}
          oauth={{ error: null, provider: null, setup: null }}
          projectDomain="example.com"
          projectId="prj_1"
          selectPropertyAction={vi.fn()}
          syncAction={vi.fn()}
          trustStrip={null}
        />
      </ToastProvider>
    );
    const { rerender } = render(workspace(activeA));

    await userEvent.click(screen.getByRole("button", { name: "Search Console property" }));
    expect(await screen.findByRole("option", { name: /example\.com/i })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    rerender(workspace(activeB));
    await userEvent.click(screen.getByRole("button", { name: "Search Console property" }));

    expect(loadPropertiesAction).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("Archived", { exact: true })).toBeInTheDocument();
    const archivedOption = screen
      .getAllByRole("option", { name: /example\.com/i })
      .find((option) => option.textContent?.includes("last synced Aug 26, 2026"));
    expect(archivedOption).toBeInTheDocument();
  });

  it("offers one archived activation confirmation from the banner", async () => {
    const selectPropertyAction = vi.fn().mockResolvedValue({
      property: "sc-domain:archive.example.com",
      status: "saved",
    });
    renderWorkspace({
      context: {
        ...context,
        importState: {
          capHitDays: 0,
          cursorDate: "2026-08-26",
          daysDone: 10,
          daysTotal: 10,
          earliestTargetDate: "2026-08-17",
          facts: readyFacts,
          finalizedThroughDate: "2026-08-26",
          lastProbeAt: null,
          lastSyncStartedAt: null,
          newestFinalizedDate: "2026-08-26",
          pausedReason: null,
          state: "completed",
        },
        selectedProperty: {
          displayName: "archive.example.com",
          kind: "domain",
          kindLabel: "domain",
          value: "sc-domain:archive.example.com",
        },
        view: "archived",
      },
      selectPropertyAction,
    });

    const message = screen.getByText("Archived - not syncing. Data ends Aug 26, 2026.");
    const action = screen.getByRole("button", { name: "Change to active" });
    expect(message).toBeInTheDocument();
    expect(screen.queryByText("2026-08-26")).toBeNull();
    expect(action).toHaveClass("shrink-0");
    expect(action).toHaveAttribute("data-variant", "secondary");
    expect(action.parentElement).toHaveClass("flex-1", "justify-between");
    expect(action.parentElement?.parentElement).toHaveClass("flex-1");
    expect(message).toHaveClass("min-w-0", "flex-1");
    await userEvent.click(action);

    const dialog = screen.getByRole("dialog", { name: "Make archive.example.com active?" });
    expect(dialog).toHaveTextContent(
      "example.com stops syncing and becomes an archive. We will fill the gap since Aug 26, 2026.",
    );
    expect(dialog).not.toHaveTextContent("sc-domain:");
    expect(within(dialog).getByRole("button", { name: "Keep example.com" })).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Make archive.example.com active" }),
    );

    expect(selectPropertyAction).toHaveBeenCalledWith({
      projectId: "prj_1",
      property: "sc-domain:archive.example.com",
    });
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalled());
  });

  it.each([
    {
      expected: "Reconnect the Google account, then choose the property again.",
      result: { status: "reauth_required" as const },
    },
    {
      expected: "Activation service unavailable.",
      result: new Error("Activation service unavailable."),
    },
  ])(
    "keeps confirmation open and reports archived activation failures",
    async ({ expected, result }) => {
      const selectPropertyAction = vi
        .fn()
        .mockImplementation(() =>
          result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
        );
      renderWorkspace({
        context: {
          ...context,
          importState: {
            capHitDays: 0,
            cursorDate: "2026-08-26",
            daysDone: 10,
            daysTotal: 10,
            earliestTargetDate: "2026-08-17",
            facts: readyFacts,
            finalizedThroughDate: "2026-08-26",
            lastProbeAt: null,
            lastSyncStartedAt: null,
            newestFinalizedDate: "2026-08-26",
            pausedReason: null,
            state: "completed",
          },
          selectedProperty: {
            displayName: "archive.example.com",
            kind: "domain",
            kindLabel: "domain",
            value: "sc-domain:archive.example.com",
          },
          view: "archived",
        },
        selectPropertyAction,
      });

      await userEvent.click(screen.getByRole("button", { name: "Change to active" }));
      await userEvent.click(
        screen.getByRole("button", { name: "Make archive.example.com active" }),
      );

      expect(await screen.findByText(expected)).toBeInTheDocument();
      expect(
        screen.getByRole("dialog", { name: "Make archive.example.com active?" }),
      ).toBeInTheDocument();
      expect(routerMock.refresh).not.toHaveBeenCalled();
    },
  );

  it("keeps archived picker rows view-only", async () => {
    renderWorkspace({
      loadPropertiesAction: vi.fn().mockResolvedValue({
        archived: [
          {
            displayName: "archive.example.com",
            kind: "domain",
            kindLabel: "domain",
            lastSyncedDate: "2026-08-26",
            value: "sc-domain:archive.example.com",
          },
        ],
        properties: [],
      }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Search Console property" }));
    const listbox = screen.getByRole("listbox", { name: "Search Console property" });
    expect(within(listbox).queryByRole("button", { name: /Make .* active/i })).toBeNull();
    await userEvent.click(
      await within(listbox).findByRole("option", { name: /archive\.example\.com/i }),
    );

    expect(routerMock.push).toHaveBeenCalledWith(
      "/app/prj_1/search-console?property=sc-domain%3Aarchive.example.com&period=28",
    );
  });
  it("keeps healthy module children visible for a GA4 setup return", () => {
    renderWorkspace({
      children: <p>GSC KPI and tables</p>,
      oauth: {
        error: null,
        provider: "ga4",
        setup: {
          error: "Couldn't load your GA4 properties.",
          failureClass: "provider_5xx",
          properties: [],
          provider: "ga4",
        },
      },
    });

    expect(screen.getByText("GSC KPI and tables")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load your GA4 properties.")).not.toBeInTheDocument();
  });

  it("keeps Search Console setup central", () => {
    renderWorkspace({
      children: <p>GSC KPI and tables</p>,
      oauth: {
        error: null,
        provider: "gsc",
        setup: {
          properties: [
            {
              kind: "domain",
              label: "example.com",
              permissionLevel: "siteOwner",
              value: "sc-domain:example.com",
            },
          ],
          provider: "gsc",
        },
      },
      syncPlan: { daysTotal: 488, pace: "normal", retentionMonths: 16 },
    });

    expect(screen.getByRole("heading", { name: "Pick the property to read" })).toBeInTheDocument();
    const googleMark = screen.getByRole("img", { name: "Google logo" });
    expect(googleMark).toHaveAttribute("data-module-mark", "soft");
    expect(googleMark.querySelector("svg")).toHaveAttribute("data-icon-weight", "regular");
    expect(screen.queryByText("GSC KPI and tables")).not.toBeInTheDocument();
  });
});
