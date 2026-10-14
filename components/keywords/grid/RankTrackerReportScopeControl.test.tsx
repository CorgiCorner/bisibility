import { DateDisplayProvider } from "@/components/dates/DateFormatProvider";
import { ProjectRankTrackerMessages } from "@/components/rank-tracker/ProjectRankTrackerMessages";
import type { LocalDashboardContext } from "@/lib/dashboard-local/model";
import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import { appPath } from "@/lib/routing/app-path";
import { routerMock, setNavigationState } from "@/tests/next-navigation";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RankTrackerReportScopeControl } from "./RankTrackerReportScopeControl";

const project = "prj_abcdefghijklmnopqrstuvwx";
const setupHref = appPath(project, "settings", "business-locations");

function renderScope(
  state: LocalDashboardContext["state"],
  view: "general" | "local" = "local",
  asOf: string | null = null,
) {
  return render(
    <ProjectRankTrackerMessages>
      <DateDisplayProvider>
        <RankTrackerReportScopeControl
          query={{
            ...defaultRankTrackerQueryState,
            page: 4,
            search: "cafe",
            reportScope: { view, subject: null, comparisonDays: 7, asOf },
          }}
          basePath={appPath(project, "m", "pmkt_abcdefghijklmnopqrstuvwx", "rank-tracker")}
          localSetupHref={setupHref}
          local={{
            context: { state, choices: [], selection: null },
            facts: [],
            summary: null,
            unsupportedFilters: false,
          }}
        />
      </DateDisplayProvider>
    </ProjectRankTrackerMessages>,
  );
}

describe("Local scope recovery", () => {
  it.each(["missing", "invalid", "unavailable", "capacity"] as const)(
    "offers project settings from %s without collecting data",
    (state) => {
      const fetch = vi.spyOn(globalThis, "fetch");
      try {
        renderScope(state);
        expect(
          screen.getByRole("link", { name: "Manage businesses and assignments" }),
        ).toHaveAttribute("href", setupHref);
        expect(screen.getByRole("status")).toBeInTheDocument();
        expect(fetch).not.toHaveBeenCalled();
      } finally {
        fetch.mockRestore();
      }
    },
  );

  it.each(["general", "local"] as const)("does not show a recovery action for ready %s", (view) => {
    renderScope("ready", view);
    expect(
      screen.queryByRole("link", { name: "Manage businesses and assignments" }),
    ).not.toBeInTheDocument();
  });
});

describe("Snapshot calendar", () => {
  beforeEach(() => setNavigationState({ searchParams: { page: "4", q: "cafe" } }));
  it("keeps snapshot controls hidden until the neutral trigger is opened", async () => {
    renderScope("ready", "general");
    const trigger = screen.getByRole("button", { name: /Snapshot time \(UTC\)/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveStyle({ fontWeight: "400" });
    expect(screen.queryByRole("group", { name: "Choose a date" })).not.toBeInTheDocument();
    await userEvent.setup().click(trigger);
    expect(screen.getByRole("group", { name: "Choose a date" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hour" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Minute" })).toBeInTheDocument();
    expect(document.querySelector('input[type="datetime-local"]')).toBeNull();
  });
  it("applies the chosen calendar day and clock as exact UTC while resetting pagination", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      renderScope("ready", "general", "2026-07-05T08:15:00.000Z");
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /Snapshot time \(UTC\)/ }));
      await user.click(screen.getByRole("button", { name: "Jul 4, 2026" }));
      await user.click(screen.getByRole("button", { name: "Hour" }));
      await user.click(await screen.findByRole("menuitem", { name: "13" }));
      await user.click(screen.getByRole("button", { name: "Minute" }));
      await user.click(await screen.findByRole("menuitem", { name: "42" }));
      await user.click(screen.getByRole("button", { name: "Apply time" }));
      await waitFor(() => expect(routerMock.push).toHaveBeenCalledOnce());
      const url = new URL(routerMock.push.mock.calls[0][0], "https://example.test");
      expect(url.searchParams.get("asOf")).toBe("2026-07-04T13:42:00.000Z");
      expect(url.searchParams.get("page")).toBe("1");
      expect(url.searchParams.get("q")).toBe("cafe");
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
  it("retains the schema's future-time rejection and calendar day ceiling", async () => {
    renderScope("ready", "general", "2026-07-05T23:00:00.000Z");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Snapshot time \(UTC\)/ }));
    expect(screen.getByRole("button", { name: "Jul 11, 2026" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Jul 10, 2026" }));
    await user.click(screen.getByRole("button", { name: "Minute" }));
    await user.click(await screen.findByRole("menuitem", { name: "01" }));
    await user.click(screen.getByRole("button", { name: "Apply time" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a valid UTC time at or before now.",
    );
    expect(routerMock.push).not.toHaveBeenCalled();
  });
  it("discards unapplied calendar and clock edits when Escape closes the popup", async () => {
    renderScope("ready", "general", "2026-07-05T08:15:00.000Z");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Snapshot time \(UTC\)/ }));
    await user.click(screen.getByRole("button", { name: "Jul 4, 2026" }));
    await user.click(screen.getByRole("button", { name: "Hour" }));
    await user.click(await screen.findByRole("menuitem", { name: "13" }));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(screen.getByRole("button", { name: /Snapshot time \(UTC\)/ }));
    expect(document.querySelector('input[name="date"]')).toHaveValue("2026-07-05T08:15");
    expect(routerMock.push).not.toHaveBeenCalled();
  });
  it("announces the chosen date and clock outside the calendar", () => {
    const { unmount } = renderScope("ready", "general", "2026-07-05T08:15:00.000Z");
    const first = screen.getByRole("button", { name: /Snapshot time \(UTC\).*08:15/ });
    const label = first.textContent;
    unmount();
    renderScope("ready", "general", "2026-07-05T14:30:00.000Z");
    expect(
      screen.getByRole("button", { name: /Snapshot time \(UTC\).*14:30/ }).textContent,
    ).not.toBe(label);
  });
  it("shows scope help through the standard tooltip without opening a dialog", async () => {
    renderScope("ready", "general");
    const help = screen.getByRole("button", { name: /The table uses your current keyword list/ });
    const user = userEvent.setup();
    await user.hover(help);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "The table uses your current keyword list",
    );
    await user.click(help);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(routerMock.push).not.toHaveBeenCalled();
  });
  it("explains the comparison period beside its labeled control", async () => {
    renderScope("ready", "general");
    expect(screen.getByRole("button", { name: "Comparison period" })).toHaveTextContent("Compare");
    const user = userEvent.setup();
    await user.hover(
      screen.getByRole("button", { name: /Compares results for the selected date/ }),
    );
    expect(await screen.findByRole("tooltip")).toHaveTextContent("at least 7 days earlier");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("returns to Latest without collecting provider data", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      renderScope("ready", "general", "2026-07-05T08:15:00.000Z");
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /Snapshot time \(UTC\)/ }));
      await user.click(
        within(screen.getByRole("dialog", { name: /Snapshot time \(UTC\)/ })).getByRole("button", {
          name: "Latest",
        }),
      );
      expect(routerMock.push).toHaveBeenCalledOnce();
      const url = new URL(routerMock.push.mock.calls[0][0], "https://example.test");
      expect(url.searchParams.get("asOf")).toBe("");
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
});
