import "./virtual-table-test-setup";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import messages from "@/messages/core/en/project-search-insights.json";
import shared from "@/messages/core/en/shared.json";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { IndexingOverview } from "./IndexingOverview";
import { indexingData, indexingUrl } from "./indexing.test-support";
import { PageIndexingTab } from "./PageIndexingTab";
import { SearchConsoleSitemapsTab } from "./SearchConsoleSitemapsTab";
import { SearchConsoleTabs } from "./SearchConsoleTabs";

const loadDetailAction = vi.fn();
const inspectAction = vi.fn();
const loadUrlsAction = vi.fn();
function renderTab(overrides: Partial<ComponentProps<typeof PageIndexingTab>> = {}) {
  const view = render(
    <FeatureMessagesProvider
      locale="en"
      timeZone="Europe/Warsaw"
      messages={{ ...shared, ...messages }}
    >
      <PageIndexingTab
        data={indexingData}
        projectId="prj_test"
        canInspect
        inspectAction={inspectAction}
        loadDetailAction={loadDetailAction}
        loadUrlsAction={loadUrlsAction}
        {...overrides}
      />
    </FeatureMessagesProvider>,
  );
  const details = screen
    .queryByText(messages.projectSearchInsights.indexing.allUrls)
    ?.closest("details");
  if (details instanceof HTMLDetailsElement) details.open = true;
  return view;
}
beforeEach(() => {
  vi.clearAllMocks();
  loadDetailAction.mockResolvedValue(indexingUrl);
  inspectAction.mockImplementation(async ({ urls }: { urls: string[] }) =>
    urls.map((url) => ({ url, status: "success" })),
  );
  loadUrlsAction.mockResolvedValue({ data: [indexingUrl], meta: { next_cursor: null } });
});
it("the tab counter exposes not-indexed pages separately from the total", () => {
  render(
    <FeatureMessagesProvider locale="en" timeZone="UTC" messages={{ ...shared, ...messages }}>
      <SearchConsoleTabs
        active="page-indexing"
        base="/app/p/search-console"
        query="period=28d"
        notIndexed={248}
      />
    </FeatureMessagesProvider>,
  );
  const link = screen.getByRole("link", { name: "Page indexing, beta, 248 not indexed" });
  expect(within(link).getByText("beta").nextElementSibling).toHaveTextContent("248");
  expect(link).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "Performance" })).toHaveAttribute(
    "href",
    "/app/p/search-console?period=28d",
  );
  const sitemaps = screen.getByRole("link", { name: "Sitemaps" });
  expect(sitemaps).toHaveAttribute("href", "/app/p/search-console?period=28d&tab=sitemaps");
  expect(within(sitemaps).queryByText("beta")).not.toBeInTheDocument();
});
it("opens stored details, focuses the drawer, closes with Escape and restores the row trigger", async () => {
  const user = userEvent.setup();
  renderTab();
  expect(screen.getByRole("link", { name: "Inspection settings" })).toHaveAttribute(
    "href",
    "/app/prj_test/settings/data-sources#url-inspection",
  );
  const trigger = screen.getByRole("button", { name: indexingUrl.url });
  await user.click(trigger);
  const dialog = await screen.findByRole("dialog");
  await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));
  expect(loadDetailAction).toHaveBeenCalledWith({ projectId: "prj_test", url: indexingUrl.url });
  expect(inspectAction).not.toHaveBeenCalled();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await waitFor(() => expect(screen.getByRole("button", { name: indexingUrl.url })).toHaveFocus());
});
it("Inspect URL submits at most ten URLs and rejects an oversized batch", async () => {
  const user = userEvent.setup();
  renderTab();
  await user.click(screen.getByRole("button", { name: "Inspect URL" }));
  const dialog = screen.getByRole("dialog");
  const input = within(dialog).getByLabelText("URLs");
  fireEvent.change(input, {
    target: {
      value: Array.from({ length: 11 }, (_, index) => `https://example.com/${index}`).join("\n"),
    },
  });
  await user.click(within(dialog).getByRole("button", { name: "Inspect URL" }));
  expect(
    await screen.findByText("Enter between 1 and 10 URLs, at most 2048 characters each."),
  ).toBeInTheDocument();
  expect(input).toHaveAttribute("aria-describedby", "indexing-inspect-help indexing-inspect-error");
  expect(document.getElementById("indexing-inspect-error")).toHaveTextContent(
    messages.projectSearchInsights.indexing.invalidBatch,
  );
  expect(
    within(dialog).getAllByText(messages.projectSearchInsights.indexing.inspectHelp),
  ).toHaveLength(1);
  expect(inspectAction).not.toHaveBeenCalled();
  const urls = Array.from({ length: 10 }, (_, index) => `https://example.com/${index}`);
  fireEvent.change(input, { target: { value: urls.join("\n") } });
  await user.click(within(dialog).getByRole("button", { name: "Inspect URL" }));
  await waitFor(() => expect(inspectAction).toHaveBeenCalledWith({ projectId: "prj_test", urls }));
  const storedButtons = await screen.findAllByRole("button", { name: "View stored result" });
  await user.click(storedButtons[0]);
  await waitFor(() =>
    expect(loadDetailAction).toHaveBeenCalledWith({ projectId: "prj_test", url: urls[0] }),
  );
  expect(inspectAction).toHaveBeenCalledTimes(1);
  await screen.findByRole("dialog");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
it("shows the no-connection state without loading or inspecting", () => {
  renderTab({ data: null });
  expect(
    screen.getByText(messages.projectSearchInsights.indexing.noConnection),
  ).toBeInTheDocument();
  expect(loadDetailAction).not.toHaveBeenCalled();
  expect(inspectAction).not.toHaveBeenCalled();
});
it("keeps stored sitemaps off the page indexing tab", () => {
  renderTab({ data: { ...indexingData, sitemaps: [] } });
  expect(
    screen.queryByText(messages.projectSearchInsights.indexing.noSitemaps),
  ).not.toBeInTheDocument();
});
it("shows the nothing-inspected state in the URL table", () => {
  renderTab({
    data: { ...indexingData, urls: [], report: { ...indexingData.report, checked: 0, total: 0 } },
  });
  expect(
    screen.getAllByText(messages.projectSearchInsights.indexing.nothingInspected),
  ).toHaveLength(1);
});
it("shows an exhausted-quota yellow callout with the computed reset timestamp", () => {
  renderTab({
    data: { ...indexingData, settings: { ...indexingData.settings, todayCount: 2000 } },
  });
  expect(screen.getByText(/Checks can resume after/).closest("[data-tint]")).toHaveAttribute(
    "data-tint",
    "yellow",
  );
  expect(screen.getByText(/Checks can resume after/)).toHaveTextContent("Checks can resume after");
});
it("allows a filter menu to be operated by keyboard", async () => {
  const user = userEvent.setup();
  renderTab();
  const filter = screen.getByRole("button", { name: "Sitemap" });
  filter.focus();
  await user.keyboard("{Enter}");
  await screen.findByRole("menu");
  await user.keyboard("{End}");
  await waitFor(() =>
    expect(screen.getByRole("menuitem", { name: indexingData.sitemaps[0].id })).toHaveFocus(),
  );
  await user.keyboard("{Enter}");
  await waitFor(() => expect(loadUrlsAction).toHaveBeenCalled());
  expect(inspectAction).not.toHaveBeenCalled();
});

it("disables inspection when the project allowance is used", () => {
  renderTab({ data: { ...indexingData, allowance: { limit: 50, used: 50, remaining: 0 } } });
  expect(screen.getByRole("button", { name: "Inspect URL" })).toBeDisabled();
  expect(screen.getByText(/Checks can resume after/).closest("[data-tint]")).toHaveAttribute(
    "data-tint",
    "yellow",
  );
});
it("keeps sitemap, search and menu focus when selecting a reason", async () => {
  const user = userEvent.setup();
  renderTab();
  await user.click(screen.getByRole("button", { name: "Sitemap" }));
  await user.click(screen.getByRole("menuitem", { name: indexingData.sitemaps[0].id }));
  await user.type(screen.getByRole("searchbox"), "duplicate");
  const trigger = screen.getByRole("button", { name: "Indexing state" });
  await user.click(trigger);
  await user.click(screen.getByRole("menuitem", { name: indexingUrl.coverageState ?? "" }));
  await waitFor(() =>
    expect(loadUrlsAction).toHaveBeenLastCalledWith({
      projectId: "prj_test",
      query: {
        page: 1,
        limit: 50,
        sort_by: "url",
        sort_direction: "asc",
        history: "true",
        group: "not_indexed",
        coverage_state: indexingUrl.coverageState,
        sitemap: indexingData.sitemaps[0].id,
        search: "duplicate",
      },
    }),
  );
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(screen.getByRole("searchbox")).toHaveValue("duplicate");
}, 20_000);

it("leads with progress and reasons, and keeps every URL under All URLs", () => {
  renderTab();
  const t = messages.projectSearchInsights.indexing;
  const lead = screen.getByText(t.lead);
  expect(screen.getByRole("progressbar", { name: t.progress.meter })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: t.reasons.title })).toBeVisible();
  expect(screen.queryByRole("heading", { name: t.sitemaps })).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: t.overview.title })).not.toBeInTheDocument();
  const urls = screen.getByRole("region", { name: t.urls });
  expect(lead.compareDocumentPosition(urls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const open = screen.getAllByRole("link", { name: t.reasons.openInPages })[0];
  expect(open).toHaveAttribute("href", expect.stringContaining("index=not_indexed"));
  expect(open?.getAttribute("href")).toContain("coverage=");
});

it.each(["sc-domain:example.com", "https://example.com/blog/"])(
  "links the complete report to the connected property %s",
  (property) => {
    render(
      <FeatureMessagesProvider locale="en" timeZone="UTC" messages={{ ...shared, ...messages }}>
        <IndexingOverview
          days={[]}
          onSelect={() => undefined}
          report={{ ...indexingData.report, property }}
        />
      </FeatureMessagesProvider>,
    );
    const link = screen.getByRole("link", { name: "Open the full report in Search Console" });
    const url = new URL(link.getAttribute("href") ?? "");
    expect(url.origin + url.pathname).toBe("https://search.google.com/search-console/index");
    expect(url.searchParams.get("resource_id")).toBe(property);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  },
);

it("says checking is off and points at settings when the budget is off", () => {
  renderTab({
    data: {
      ...indexingData,
      settings: { ...indexingData.settings, budgetMode: "off" },
    },
  });
  const t = messages.projectSearchInsights.indexing;
  expect(screen.getByRole("heading", { name: t.progress.off })).toBeVisible();
  expect(screen.getByRole("link", { name: t.progress.settings })).toHaveAttribute(
    "href",
    "/app/prj_test/settings/data-sources#url-inspection",
  );
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
});
it("shows an empty sitemap list on the sitemaps tab", () => {
  render(
    <FeatureMessagesProvider locale="en" timeZone="UTC" messages={{ ...shared, ...messages }}>
      <SearchConsoleSitemapsTab data={{ ...indexingData, sitemaps: [] }} projectId="prj_test" />
    </FeatureMessagesProvider>,
  );
  expect(screen.getByText(messages.projectSearchInsights.indexing.noSitemaps)).toBeInTheDocument();
});

it("uses one All URLs surface with flat full-width sections and matched header actions", () => {
  const { container } = renderTab();
  const content = container.querySelector("[data-indexing-all-urls]");
  expect(content).toHaveClass("divide-y", "divide-border");
  expect(content?.querySelector(".rounded-card.border")).toBeNull();
  expect(content?.parentElement).toHaveClass("px-0", "pb-0", "sm:px-0");
  const settings = screen.getByRole("link", { name: "Inspection settings" });
  const inspect = screen.getByRole("button", { name: "Inspect URL" });
  expect(settings.parentElement).toBe(inspect.parentElement);
  expect(settings).toHaveAttribute("data-size", "sm");
  expect(inspect).toHaveAttribute("data-size", "sm");
  const search = screen.getByRole("searchbox");
  const state = screen.getByRole("button", { name: "Indexing state" });
  expect(search.closest("label")?.parentElement).toBe(state.parentElement);
  expect(search.compareDocumentPosition(state) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
