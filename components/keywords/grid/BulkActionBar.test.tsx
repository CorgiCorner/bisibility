import { keywordRows } from "@/components/keywords/keywords-fixtures";
import type { KeywordRow } from "@/lib/queries/keywords";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BulkActionBar } from "./BulkActionBar";

const actions = {
  bulkClearTargetAction: vi.fn(async () => undefined),
  bulkDeleteAction: vi.fn(async () => undefined),
  bulkSetTargetAction: vi.fn(async () => undefined),
  bulkTagAction: vi.fn(async () => undefined),
};
const row = keywordRows[0] as KeywordRow;

describe("BulkActionBar", () => {
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

  it("shares the filter-bar chrome instead of an accent fill", () => {
    const { container } = render(
      <BulkActionBar
        {...actions}
        canDeleteKeyword
        canUpdateKeyword
        onClear={vi.fn()}
        projectId="prj_1"
        selectedRows={[row]}
      />,
    );

    const bar = container.firstElementChild;
    expect(bar).toHaveClass("border-b", "border-border");
    expect(bar).not.toHaveClass("bg-accent-soft");
    expect(screen.getByText("1 selected")).toHaveClass("text-fg");
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
      expect(screen.getByRole("button", { name })).toHaveClass("min-h-[30px]");
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

  it("does not highlight a depth for a mixed selection", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Choose check depth" }));
    expect(
      screen.getAllByRole("menuitem").every((item) => item.querySelector("svg") === null),
    ).toBe(true);

    fireEvent.click(screen.getByRole("menuitem", { name: "Top 20" }));
    expect(onRunChecks).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Run checks (Top 20)" })).toBeInTheDocument();
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
