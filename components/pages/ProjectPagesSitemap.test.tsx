import { TooltipProvider } from "@/components/ui/Tooltip";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import pagesMessages from "@/messages/core/en/project-pages.json";
import searchMessages from "@/messages/core/en/project-search-insights.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ProjectPagesFilters } from "./ProjectPagesFilters";
import { ProjectPagesToolbar } from "./ProjectPagesToolbar";
import { pageRow, pagesList, pagesQuery } from "./project-pages-fixtures";

const messages = mergeMessageCatalogs(sharedMessages, pagesMessages, searchMessages);
it("shows only All and a neutral explanation before any sitemap read", () => {
  renderWithFeatureMessages(
    <ProjectPagesToolbar
      canWrite
      columns={[]}
      counts={pagesList([pageRow()]).counts}
      onFilters={vi.fn()}
      onNewTag={vi.fn()}
      onQuery={vi.fn()}
      onSearchChange={vi.fn()}
      pending={false}
      query={pagesQuery}
      search=""
      showStatus={false}
      sitemapChecked={false}
      tags={[]}
    />,
    { messages, wrapper: TooltipProvider },
  );
  expect(screen.getByRole("button", { name: "All 1" })).toBeInTheDocument();
  expect(screen.getByText("Sitemap not checked")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Not in sitemap/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /In sitemap/ })).not.toBeInTheDocument();
});
it("disables the sitemap filter with an explanation, retaining other filters", () => {
  renderWithFeatureMessages(
    <ProjectPagesFilters
      onClose={vi.fn()}
      onQuery={vi.fn()}
      open
      query={{ ...pagesQuery, sitemap: "not_listed" }}
      sitemapChecked={false}
    />,
    { messages, wrapper: TooltipProvider },
  );
  expect(screen.getByRole("button", { name: "Sitemap" })).toBeDisabled();
  expect(screen.getByText(/Available after the project sitemap/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Source" })).toBeEnabled();
});
it("keeps the two sitemap segments when a read exists", () => {
  const onQuery = vi.fn();
  renderWithFeatureMessages(
    <ProjectPagesToolbar
      canWrite
      columns={[]}
      counts={pagesList([pageRow()]).counts}
      onFilters={vi.fn()}
      onNewTag={vi.fn()}
      onQuery={onQuery}
      onSearchChange={vi.fn()}
      pending={false}
      query={pagesQuery}
      search=""
      showStatus={false}
      sitemapChecked
      sitemapReadAt={new Date("2026-11-13T04:45:00Z")}
      tags={[]}
    />,
    { messages, wrapper: TooltipProvider },
  );
  expect(screen.getByText(/Last successful read:.*2026.*UTC/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Not in sitemap 0" }));
  expect(onQuery).toHaveBeenCalledWith({ ...pagesQuery, page: 1, sitemap: "not_listed" });
});

it("keeps positives usable while an incomplete read has no measured absence count", () => {
  renderWithFeatureMessages(
    <ProjectPagesToolbar
      canWrite
      columns={[]}
      counts={{ ...pagesList([pageRow()]).counts, notListed: null }}
      onFilters={vi.fn()}
      onNewTag={vi.fn()}
      onQuery={vi.fn()}
      onSearchChange={vi.fn()}
      pending={false}
      query={pagesQuery}
      search=""
      showStatus={false}
      sitemapChecked
      sitemapComplete={false}
      tags={[]}
    />,
    { messages, wrapper: TooltipProvider },
  );
  expect(screen.getByRole("button", { name: "In sitemap 1" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: /^Not in sitemap/ })).not.toBeInTheDocument();
  expect(screen.getByText("Not in sitemap: not checked")).toBeInTheDocument();
});

it("allows positive filtering and disables only absence for incomplete evidence", async () => {
  renderWithFeatureMessages(
    <ProjectPagesFilters
      onClose={vi.fn()}
      onQuery={vi.fn()}
      open
      query={pagesQuery}
      sitemapChecked
      sitemapComplete={false}
    />,
    { messages, wrapper: TooltipProvider },
  );
  fireEvent.click(screen.getByRole("button", { name: "Sitemap" }));
  expect(await screen.findByRole("menuitem", { name: "Not listed" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  expect(screen.getByRole("menuitem", { name: "Listed" })).not.toHaveAttribute(
    "aria-disabled",
    "true",
  );
});
