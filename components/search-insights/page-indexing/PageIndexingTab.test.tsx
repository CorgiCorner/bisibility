import "./virtual-table-test-setup";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import messages from "@/messages/core/en/project-search-insights.json";
import shared from "@/messages/core/en/shared.json";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { indexingData, indexingUrl } from "./indexing.test-support";
import { PageIndexingTab } from "./PageIndexingTab";
import { SearchConsoleTabs } from "./SearchConsoleTabs";

const loadDetailAction = vi.fn();
const inspectAction = vi.fn();
const loadUrlsAction = vi.fn();
function renderTab(overrides: Partial<ComponentProps<typeof PageIndexingTab>> = {}) {
  return render(
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
it("shows no stored sitemap origins honestly", () => {
  renderTab({ data: { ...indexingData, sitemaps: [] } });
  expect(screen.getByText(messages.projectSearchInsights.indexing.noSitemaps)).toBeInTheDocument();
});
it("shows the nothing-inspected state", () => {
  renderTab({
    data: { ...indexingData, urls: [], report: { ...indexingData.report, checked: 0, total: 0 } },
  });
  expect(
    screen.getAllByText(messages.projectSearchInsights.indexing.nothingInspected),
  ).toHaveLength(2);
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
});

it("puts tracked URLs and sitemaps before the secondary overview", () => {
  renderTab();
  const t = messages.projectSearchInsights.indexing;
  const overview = screen.getByRole("region", { name: "Overview from our checks" });
  expect(overview.tagName).toBe("SECTION");
  const feedback = within(overview).getByRole("link", { name: "Want to keep it? Email us" });
  expect(feedback).toBeVisible();
  expect(feedback.getAttribute("href")).toMatch(/^mailto:feedback@bisibility\.com\?subject=/);
  expect(within(overview).getByText(t.overview.removalNotice)).toBeVisible();
  expect(within(overview).getByText(t.overview.note)).toBeInTheDocument();
  const urls = screen.getByRole("region", { name: t.urls });
  const sitemaps = screen.getByRole("heading", { name: t.sitemaps });
  expect(urls.compareDocumentPosition(sitemaps) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(
    sitemaps.compareDocumentPosition(overview) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  const status = screen.getByRole("button", { name: t.inspect });
  expect(status.compareDocumentPosition(urls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const cards = overview.querySelectorAll('[data-slot="card"]');
  expect(cards).toHaveLength(3);
  expect(overview).toHaveClass("bg-bg-sunken");
  for (const card of cards) expect(card).not.toHaveClass("bg-bg-sunken");
  expect(cards[0].querySelector("dl")).toBeInTheDocument();
  expect(cards[1]).toHaveTextContent(t.trendTitle);
  expect(cards[2]).toHaveTextContent(t.reasonsTitle);
});

it.each(["sc-domain:example.com", "https://example.com/blog/"])(
  "links the complete report to the connected property %s",
  (property) => {
    renderTab({ data: { ...indexingData, report: { ...indexingData.report, property } } });
    const link = screen.getByRole("link", { name: "Open the full report in Search Console" });
    const url = new URL(link.getAttribute("href") ?? "");
    expect(url.origin + url.pathname).toBe("https://search.google.com/search-console/index");
    expect(url.searchParams.get("resource_id")).toBe(property);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  },
);

it("filters, focuses and scrolls to tracked URLs when an overview reason is selected", async () => {
  const user = userEvent.setup();
  renderTab();
  const t = messages.projectSearchInsights.indexing;
  const urls = screen.getByRole("region", { name: t.urls });
  const scroll = vi.fn();
  urls.scrollIntoView = scroll;
  const reasons = screen.getByRole("table", { name: t.reasonsTitle });
  await user.click(within(reasons).getByText(indexingUrl.coverageState ?? ""));
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
      },
    }),
  );
  expect(urls).toHaveFocus();
  expect(scroll).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });
  expect(screen.getByRole("button", { name: "Indexing state" })).toHaveTextContent(
    indexingUrl.coverageState ?? "",
  );
});
