import { TooltipProvider } from "@/components/ui/Tooltip";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import { emptyProjectPageTagView } from "@/lib/pages/tag-view";
import { projectPagesHref } from "@/lib/pages/url-state";
import pagesMessages from "@/messages/core/en/project-pages.json";
import searchMessages from "@/messages/core/en/project-search-insights.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { routerMock } from "@/tests/next-navigation";
import { stubResizeObserver } from "@/tests/observers";
import { fireEvent, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ProjectPagesActions, ProjectPagesScreen } from "./ProjectPagesScreen";
import { pageRow, pagesList, pagesQuery, sitemapOnlySources } from "./project-pages-fixtures";

const messages = mergeMessageCatalogs(sharedMessages, pagesMessages, searchMessages);
const actions: ProjectPagesActions = {
  addManual: vi.fn(),
  checkVitals: vi.fn(),
  load: vi.fn(),
  loadCompare: vi.fn(),
  loadComparison: vi.fn(),
  loadTags: vi.fn(),
  previewRule: vi.fn(),
  refresh: vi.fn(),
  removeFromPages: vi.fn(),
  saveRule: vi.fn(),
  setManual: vi.fn(),
  takeSnapshot: vi.fn(),
};
const props: ComponentProps<typeof ProjectPagesScreen> = {
  actions,
  canCreateTags: false,
  canDeleteTags: false,
  canEditTags: false,
  canWrite: false,
  initialList: pagesList([pageRow()]),
  initialQuery: pagesQuery,
  initialTags: emptyProjectPageTagView,
  projectId: "prj_1",
  sources: sitemapOnlySources(),
};

describe("Pages server navigation", () => {
  beforeEach(() => stubResizeObserver());

  it.each([
    ["by-tag", /By tag/],
    ["existing-vs-new", /Existing vs new/],
    ["compare", /Compare/],
  ] as const)("switches to %s and back when server props change", (tab, label) => {
    const view = renderWithFeatureMessages(<ProjectPagesScreen {...props} />, {
      messages,
      wrapper: TooltipProvider,
    });
    expect(screen.getByRole("link", { name: /All pages/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("/docs")).toBeInTheDocument();
    view.rerender(<ProjectPagesScreen {...props} initialQuery={{ ...pagesQuery, tab }} />);
    expect(screen.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByText("/docs")).not.toBeInTheDocument();
    expect(view.container.querySelector("[data-pages-tab]")).toHaveAttribute("data-pages-tab", tab);
    view.rerender(<ProjectPagesScreen {...props} />);
    expect(screen.getByRole("link", { name: /All pages/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("/docs")).toBeInTheDocument();
  });

  it("restores search, sort and list from server props, including a same-query refresh", () => {
    const view = renderWithFeatureMessages(<ProjectPagesScreen {...props} />, {
      messages,
      wrapper: TooltipProvider,
    });
    const next = {
      ...pagesQuery,
      page: 2,
      search: "guide",
      sort: "path" as const,
      dir: "asc" as const,
      tag: "tag_1",
    };
    const nextList = pagesList([pageRow({ path: "/guide", url: "https://example.com/guide" })]);
    view.rerender(<ProjectPagesScreen {...props} initialList={nextList} initialQuery={next} />);
    expect(screen.getByRole("searchbox")).toHaveValue("guide");
    expect(screen.getByText("/guide")).toBeInTheDocument();
    expect(screen.queryByText("/docs")).not.toBeInTheDocument();
    view.rerender(
      <ProjectPagesScreen {...props} initialQuery={next} initialList={pagesList([])} />,
    );
    expect(screen.queryByText("/guide")).not.toBeInTheDocument();
    view.rerender(<ProjectPagesScreen {...props} />);
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(screen.getByText("/docs")).toBeInTheDocument();
  });

  it("sends an in-page search through the router and waits for server data", () => {
    renderWithFeatureMessages(<ProjectPagesScreen {...props} />, {
      messages,
      wrapper: TooltipProvider,
    });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "guide" } });
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Enter" });
    expect(routerMock.push).toHaveBeenCalledWith(
      projectPagesHref("prj_1", { ...pagesQuery, search: "guide" }),
      { scroll: false },
    );
    expect(actions.load).not.toHaveBeenCalled();
    expect(screen.getByText("/docs")).toBeInTheDocument();
  });
});
