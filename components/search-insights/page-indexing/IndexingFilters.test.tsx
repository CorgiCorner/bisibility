import "./virtual-table-test-setup";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import type { IndexingData } from "@/lib/search-index/ui-model";
import messages from "@/messages/core/en/project-search-insights.json";
import shared from "@/messages/core/en/shared.json";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { indexingData, indexingUrl } from "./indexing.test-support";
import { PageIndexingTab } from "./PageIndexingTab";

const action = vi.fn();
const inspect = vi.fn();
function tab(data: IndexingData = indexingData) {
  return render(
    <FeatureMessagesProvider locale="en" timeZone="UTC" messages={{ ...shared, ...messages }}>
      <PageIndexingTab
        data={data}
        projectId="p"
        canInspect
        loadUrlsAction={action}
        loadDetailAction={async () => indexingUrl}
        inspectAction={inspect}
      />
    </FeatureMessagesProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  action.mockResolvedValue({ data: [indexingUrl], meta: { next_cursor: null } });
  inspect.mockResolvedValue([{ url: indexingUrl.url, status: "success" }]);
});
afterEach(() => vi.useRealTimers());
it("five quick search changes load once, and Enter flushes the next change", async () => {
  vi.useFakeTimers();
  tab();
  const input = screen.getByRole("searchbox");
  for (const value of ["h", "he", "hel", "hell", "hello"]) {
    fireEvent.change(input, { target: { value } });
  }
  expect(action).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTimeAsync(299));
  expect(action).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(action).toHaveBeenCalledTimes(1);
  expect(action).toHaveBeenLastCalledWith({
    projectId: "p",
    query: {
      page: 1,
      limit: 50,
      sort_by: "url",
      sort_direction: "asc",
      history: "true",
      search: "hello",
    },
  });
  fireEvent.change(input, { target: { value: "world" } });
  fireEvent.keyDown(input, { key: "Enter" });
  await act(() => vi.advanceTimersByTimeAsync(300));
  expect(action).toHaveBeenCalledTimes(2);
  expect(action).toHaveBeenLastCalledWith({
    projectId: "p",
    query: {
      page: 1,
      limit: 50,
      sort_by: "url",
      sort_direction: "asc",
      history: "true",
      search: "world",
    },
  });
});
it("cancels a pending search on unmount", async () => {
  vi.useFakeTimers();
  const view = tab();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "pending" } });
  view.unmount();
  await act(() => vi.advanceTimersByTimeAsync(300));
  expect(action).not.toHaveBeenCalled();
});
it("qualifies the same coverage state by group and sends Unspecified literally", async () => {
  const user = userEvent.setup();
  tab({
    ...indexingData,
    report: {
      ...indexingData.report,
      groups: indexingData.report.groups.map((group) => ({
        ...group,
        reasons:
          group.group === "indexed" || group.group === "not_indexed"
            ? [{ coverageState: "Unspecified", total: 1, oldestResultAt: null }]
            : [{ coverageState: null, total: 1, oldestResultAt: null }],
      })),
    },
  });
  const table = screen.getByRole("table", {
    name: messages.projectSearchInsights.indexing.reasonsTitle,
  });
  const reasons = within(table).getAllByText("Unspecified");
  await user.click(reasons[1]);
  await waitFor(() =>
    expect(action).toHaveBeenLastCalledWith({
      projectId: "p",
      query: {
        page: 1,
        limit: 50,
        sort_by: "url",
        sort_direction: "asc",
        history: "true",
        group: "not_indexed",
        coverage_state: "Unspecified",
      },
    }),
  );
  await user.click(screen.getByRole("button", { name: "Indexing state" }));
  const options = screen.getAllByRole("menuitem", { name: "Unspecified" });
  expect(options).toHaveLength(2);
  await user.click(options[0]);
  await waitFor(() =>
    expect(action).toHaveBeenLastCalledWith({
      projectId: "p",
      query: {
        page: 1,
        limit: 50,
        sort_by: "url",
        sort_direction: "asc",
        history: "true",
        group: "indexed",
        coverage_state: "Unspecified",
      },
    }),
  );
});
it("renders only section totals for non-filterable groups", () => {
  tab({
    ...indexingData,
    report: {
      ...indexingData.report,
      groups: indexingData.report.groups.map((group) => ({ ...group, total: 1 })),
    },
  });
  const table = screen.getByRole("table", {
    name: messages.projectSearchInsights.indexing.reasonsTitle,
  });
  for (const name of ["Inspection failed (not from Google)", "Not checked yet"]) {
    const section = within(table).getByText(name).closest('[role="row"]');
    expect(section).toHaveAttribute("tabindex", "-1");
    expect(section).not.toHaveClass("cursor-pointer");
    expect(within(table).getAllByText(name)).toHaveLength(1);
  }
});
it("reason clicks and inspection refresh preserve filters and loaded pages", async () => {
  const user = userEvent.setup();
  const second = { ...indexingUrl, url: "https://example.com/second" };
  action.mockImplementation(async ({ query }) =>
    query.page === 2
      ? { data: [second], meta: { next_cursor: null, total: 75, page: 2 } }
      : { data: [indexingUrl], meta: { next_cursor: null, total: 75, page: 1 } },
  );
  tab();
  await user.click(screen.getByRole("button", { name: "Sitemap" }));
  await user.click(screen.getByRole("menuitem", { name: indexingData.sitemaps[0].id }));
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "example" } });
  const reasons = screen.getByRole("table", {
    name: messages.projectSearchInsights.indexing.reasonsTitle,
  });
  await user.click(within(reasons).getByText(indexingUrl.coverageState ?? ""));
  const query = {
    page: 1,
    limit: 50,
    sort_by: "url",
    sort_direction: "asc",
    history: "true" as const,
    group: "not_indexed",
    coverage_state: indexingUrl.coverageState,
    sitemap: indexingData.sitemaps[0].id,
    search: "example",
  };
  await waitFor(() => expect(action).toHaveBeenLastCalledWith({ projectId: "p", query }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: "Next page" }));
  await screen.findByRole("button", { name: second.url });
  await user.click(screen.getByRole("button", { name: "Inspect URL" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("URLs"), { target: { value: indexingUrl.url } });
  action.mockClear();
  await user.click(within(dialog).getByRole("button", { name: "Inspect URL" }));
  await waitFor(() => expect(action).toHaveBeenCalledOnce());
  expect(action).toHaveBeenCalledWith({ projectId: "p", query: { ...query, page: 2 } });
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: second.url })).toBeInTheDocument();
  expect(screen.getByRole("searchbox")).toHaveValue("example");
});
it("keeps a reason click when a debounced search completes between press and release", async () => {
  const user = userEvent.setup();
  tab();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "example" } });
  const table = screen.getByRole("table", {
    name: messages.projectSearchInsights.indexing.reasonsTitle,
  });
  const reason = within(table).getByText(indexingUrl.coverageState ?? "");
  await user.pointer({ target: reason, keys: "[MouseLeft>]" });
  await waitFor(() =>
    expect(action).toHaveBeenCalledWith({
      projectId: "p",
      query: {
        page: 1,
        limit: 50,
        sort_by: "url",
        sort_direction: "asc",
        history: "true",
        search: "example",
      },
    }),
  );
  await user.pointer({ keys: "[/MouseLeft]" });
  await waitFor(() =>
    expect(action).toHaveBeenLastCalledWith({
      projectId: "p",
      query: {
        page: 1,
        limit: 50,
        sort_by: "url",
        sort_direction: "asc",
        history: "true",
        search: "example",
        group: "not_indexed",
        coverage_state: indexingUrl.coverageState,
      },
    }),
  );
});

it("keeps the small URL table scrollable without overlapping pinned columns", () => {
  tab();
  const table = screen.getByRole("table", { name: "URLs" });
  expect(within(table).getByRole("columnheader", { name: "URL" })).not.toHaveStyle({
    position: "sticky",
  });
  expect(within(table).getByRole("columnheader", { name: "Indexing state" })).not.toHaveStyle({
    position: "sticky",
  });
});

it("pages and sorts the filtered dataset instead of appending rows", async () => {
  const user = userEvent.setup();
  action.mockImplementation(async ({ query }) => ({
    data: [{ ...indexingUrl, url: `https://example.com/page-${query.page}` }],
    meta: { next_cursor: null, total: 120, page: query.page },
  }));
  tab({ ...indexingData, totalUrls: 120 });
  const table = screen.getByRole("table", { name: "URLs" });
  expect(table).toHaveAttribute("data-layout", "fill");
  expect(screen.queryByRole("button", { name: "Load more URLs" })).not.toBeInTheDocument();
  await user.click(within(table).getByRole("button", { name: "Next page" }));
  await waitFor(() =>
    expect(action).toHaveBeenLastCalledWith({
      projectId: "p",
      query: { history: "true", page: 2, limit: 50, sort_by: "url", sort_direction: "asc" },
    }),
  );
  await user.click(
    within(screen.getByRole("table", { name: "URLs" })).getByRole("button", {
      name: "Sort URL descending",
    }),
  );
  await waitFor(() =>
    expect(action).toHaveBeenLastCalledWith({
      projectId: "p",
      query: { history: "true", page: 1, limit: 50, sort_by: "url", sort_direction: "desc" },
    }),
  );
  await user.click(screen.getByRole("button", { name: "Indexing state" }));
  for (const name of [
    "Indexed",
    "Not indexed",
    "Inspection failed (not from Google)",
    "Not checked yet",
  ])
    expect(screen.getByRole("menuitem", { name })).toBeVisible();
  await user.click(screen.getByRole("menuitem", { name: "Not checked yet" }));
  await waitFor(() =>
    expect(action).toHaveBeenLastCalledWith({
      projectId: "p",
      query: {
        history: "true",
        page: 1,
        limit: 50,
        sort_by: "url",
        sort_direction: "desc",
        group: "not_checked",
      },
    }),
  );
});
