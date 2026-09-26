import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { KeywordRow } from "@/lib/queries/keywords";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BulkActionBar } from "./BulkActionBar";

const actions = {
  bulkClearTargetAction: vi.fn(async () => undefined),
  bulkDeleteAction: vi.fn(async () => undefined),
  bulkSetTargetAction: vi.fn(async () => undefined),
  bulkTagAction: vi.fn(async () => undefined),
};
const row = keywordRows[0] as KeywordRow;

afterEach(() => vi.unstubAllGlobals());

describe("BulkActionBar", () => {
  it.each(["Cancel", "Close modal"])(
    "resets the schedule flow after closing with %s",
    async (closeButton) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({ json: async () => ({ data: [] }), ok: true })),
      );
      render(
        <BulkActionBar
          {...actions}
          canDeleteKeyword
          canUpdateKeyword
          onClear={vi.fn()}
          projectId="prj_1"
          selectedRows={[row]}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Set schedule" }));
      fireEvent.click(await screen.findByRole("button", { name: /^New schedule/ }));
      fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
        target: { value: "Draft cadence" },
      });
      fireEvent.click(screen.getByRole("button", { name: closeButton }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: "Set schedule" }));
      expect(await screen.findByRole("radiogroup", { name: "Schedule" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /^New schedule/ }));
      expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Daily 06:00");
    },
  );

  it("shows the selected depth and runs only from the main button", () => {
    const onRunChecks = vi.fn();
    render(
      <BulkActionBar
        {...actions}
        canDeleteKeyword
        canUpdateKeyword
        onClear={vi.fn()}
        onRunChecks={onRunChecks}
        projectId="prj_1"
        providerRate={{ overrideCents: 10, providerId: "dataforseo" }}
        selectedRows={[{ ...row, schedule: { ...row.schedule, serp_depth: 50 } }]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run check (Top 50)" }));
    expect(onRunChecks).toHaveBeenLastCalledWith([row.id]);

    fireEvent.click(screen.getByRole("button", { name: "Choose check depth" }));
    expect(screen.getByRole("menuitem", { name: "Top 50" }).querySelector("svg")).not.toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Top 20" }));
    expect(onRunChecks).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Run check (Top 20)" })).toBeInTheDocument();
    expect(screen.queryByText(/This run/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Run check (Top 20)" }));
    expect(onRunChecks).toHaveBeenLastCalledWith([row.id], 20);
  }, 15_000);

  it("floats on the card surface instead of an accent fill", () => {
    render(
      <BulkActionBar
        {...actions}
        canDeleteKeyword
        canUpdateKeyword
        onClear={vi.fn()}
        projectId="prj_1"
        selectedRows={[row]}
      />,
    );

    const bar = screen.getByRole("toolbar", { name: "Actions for selected keywords" });
    expect(bar).toHaveClass("bg-bg-elev", "border", "border-border", "rounded-card");
    expect(bar).not.toHaveClass("bg-accent-soft");
    expect(bar.closest("[data-floating-selection-bar]")).toHaveClass("fixed", "bottom-0");
    expect(within(bar).getByText("1 selected")).toHaveClass("text-fg");
    expect(screen.getByRole("status")).toHaveTextContent("1 selected");
  });

  it("renders no bar and no dialogs without a selection", () => {
    render(
      <BulkActionBar
        {...actions}
        canDeleteKeyword
        canUpdateKeyword
        onClear={vi.fn()}
        projectId="prj_1"
        selectedRows={[]}
      />,
    );

    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("shows an action error in the bar footer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ json: async () => ({}), ok: false })),
    );
    render(
      <BulkActionBar
        {...actions}
        canDeleteKeyword
        canUpdateKeyword
        onClear={vi.fn()}
        projectId="prj_1"
        selectedRows={[row]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Set schedule" }));
    const bar = screen.getByRole("toolbar", { name: "Actions for selected keywords" });
    expect(
      await within(bar).findByText("Could not load schedules. Try again."),
    ).toBeInTheDocument();
  });

  it("uses the shared xs control height for every bulk action", () => {
    render(
      <BulkActionBar
        {...actions}
        canDeleteKeyword
        canUpdateKeyword
        onClear={vi.fn()}
        onRunChecks={vi.fn()}
        projectId="prj_1"
        selectedRows={[{ ...row, schedule: { ...row.schedule, serp_depth: 100 } }]}
      />,
    );

    for (const name of [
      "Run check (Top 100)",
      "Add tag",
      "Change target URL",
      "Set schedule",
      "Delete",
      "Clear",
    ]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("data-size", "xs");
    }
  });

  it("offers Connect a SERP provider instead of the depth picker when disconnected", () => {
    const onRunChecks = vi.fn();
    render(
      <BulkActionBar
        {...actions}
        canDeleteKeyword
        canUpdateKeyword
        onClear={vi.fn()}
        onRunChecks={onRunChecks}
        projectId="prj_1"
        providerConnected={false}
        selectedRows={[{ ...row, schedule: { ...row.schedule, serp_depth: 50 } }]}
      />,
    );

    expect(screen.getByRole("link", { name: "Connect a SERP provider" })).toHaveAttribute(
      "href",
      "/app/prj_1/integrations",
    );
    expect(
      screen.getByRole("link", { name: "Connect a SERP provider" }).querySelector("svg"),
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Choose check depth" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Run check/ })).not.toBeInTheDocument();
  });

  it("shows each effective depth without highlighting one for a mixed selection", () => {
    const onRunChecks = vi.fn();
    render(
      <BulkActionBar
        {...actions}
        canDeleteKeyword
        canUpdateKeyword
        onClear={vi.fn()}
        onRunChecks={onRunChecks}
        projectId="prj_1"
        selectedRows={[
          { ...row, schedule: { ...row.schedule, serp_depth: 50 } },
          { ...row, id: "kw_2", schedule: { ...row.schedule, serp_depth: 20 } },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run checks (Top 20 / Top 50)" }));
    expect(onRunChecks).toHaveBeenLastCalledWith([row.id, "kw_2"]);
    onRunChecks.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Choose check depth" }));
    expect(
      screen.getAllByRole("menuitem").every((item) => item.querySelector("svg") === null),
    ).toBe(true);

    fireEvent.click(screen.getByRole("menuitem", { name: "Top 20" }));
    expect(onRunChecks).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Run checks (Top 20)" })).toBeInTheDocument();
  });

  it("localizes the pending list action and keeps its depth menu non-mutating", () => {
    const onRunChecks = vi.fn();
    render(
      <BulkActionBar
        {...actions}
        canDeleteKeyword
        canUpdateKeyword
        checksRunning
        onClear={vi.fn()}
        onRunChecks={onRunChecks}
        projectId="prj_1"
        selectedRows={[{ ...row, schedule: { ...row.schedule, serp_depth: 10 } }]}
      />,
    );

    const action = screen.getByRole("button", { name: "Starting..." });
    expect(action).toBeDisabled();
    expect(screen.getByRole("button", { name: "Choose check depth" })).toBeDisabled();
    expect(onRunChecks).not.toHaveBeenCalled();
  });

  it("opens the set-schedule modal after reading the authenticated schedules route", async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({ data: [] }),
      ok: true,
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <BulkActionBar
        {...actions}
        canDeleteKeyword
        canUpdateKeyword
        onClear={vi.fn()}
        projectId="prj_1"
        selectedRows={[row]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Set schedule" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/check-schedules?project=prj_1",
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
    expect(screen.getByRole("dialog", { name: /Set schedule for 1 keyword/ })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
