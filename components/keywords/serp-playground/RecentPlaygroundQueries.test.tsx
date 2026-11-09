import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { ComparisonRun } from "@/lib/provider-comparison/types";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { RecentPlaygroundQueries } from "./RecentPlaygroundQueries";

const calls = vi.hoisted(() => ({ list: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/actions/serp-playground-history", () => ({
  readPlaygroundHistoryAction: calls.list,
}));
vi.mock("@/lib/actions/serp-playground", () => ({ readSerpPlaygroundAction: calls.read }));
it("browses 100 searches without loading every result, and searches before selecting", async () => {
  const rows: ComparisonRun[] = Array.from({ length: 100 }, (_, i) => ({
    id: `run-${i}`,
    createdAt: "2026-11-09T10:00:00Z",
    keyword: {
      id: "",
      text: `Query ${String(i + 1).padStart(3, "0")}`,
      device: "desktop",
      locationLabel: "United States",
    },
    depth: 20,
    sides: [],
  }));
  calls.list.mockImplementation(async ({ page, query }) => {
    const found = rows.filter((row) => row.keyword.text.includes(query));
    return {
      ok: true,
      history: {
        entries: found.slice(page * 10, page * 10 + 10),
        total: found.length,
        page,
        pageSize: 10,
      },
    };
  });
  calls.read.mockImplementation(async ({ runId }) => ({
    ok: true,
    run: rows.find((row) => row.id === runId),
  }));
  const select = vi.fn();
  render(
    <RecentPlaygroundQueries
      projectRef="prj_test"
      history={rows.slice(0, 12)}
      busy={false}
      selectRun={select}
    />,
  );
  expect(screen.queryByText("Query 004")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Search history" }));
  const dialog = screen.getByRole("dialog");
  await within(dialog).findByText("100 searches");
  expect(within(dialog).getAllByRole("listitem")).toHaveLength(10);
  expect(calls.read).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
  await within(dialog).findByText("Query 011");
  fireEvent.change(within(dialog).getByLabelText("Find a search"), { target: { value: "099" } });
  await within(dialog).findByText("1 searches");
  fireEvent.click(within(dialog).getByRole("button", { name: /Query 099/ }));
  await waitFor(() => expect(select).toHaveBeenCalledWith(rows[98]));
  expect(calls.read).toHaveBeenCalledWith({ projectRef: "prj_test", runId: "run-98" });
});
