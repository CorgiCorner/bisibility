import { render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { storyQueryDetail } from "./drawer-story-fixtures";
import { SearchInsightsDrawer, type SearchInsightsDrawerProps } from "./SearchInsightsDrawer";

function renderTrackedDrawer(overrides: Partial<SearchInsightsDrawerProps> = {}) {
  const props: SearchInsightsDrawerProps = {
    adding: new Set(),
    back: null,
    bodyRef: createRef<HTMLDivElement>(),
    canTrack: true,
    counts: { band: 0, overlap: 0 },
    entry: {
      content: { detail: { ...storyQueryDetail, tracked: true }, kind: "query" },
      status: "ready",
    },
    frame: { kind: "query", query: storyQueryDetail.query },
    namedQueryCounts: { band: 0, overlap: 0 },
    onBack: vi.fn(),
    onClose: vi.fn(),
    onExited: vi.fn(),
    onOpen: vi.fn(),
    onRetry: vi.fn(),
    onShowAll: vi.fn(),
    onTrack: vi.fn(),
    open: true,
    seen: new Set(),
    tracked: new Set(),
    ...overrides,
  };
  return render(<SearchInsightsDrawer {...props} />);
}

describe("SearchInsightsDrawer footer", () => {
  it("right-aligns the natural-width tracked status", async () => {
    renderTrackedDrawer();

    const tracked = await screen.findByText("Tracked in Rank Tracker");
    const footer = tracked.closest("footer");
    expect(footer?.firstElementChild).toHaveClass("flex", "min-w-0", "justify-end");
    expect(tracked).not.toHaveClass("flex-1");
    expect(tracked).not.toHaveStyle({ flex: "1" });
  });
});

describe("SearchInsightsDrawer title", () => {
  it("links only a query title to its exact Google search", async () => {
    renderTrackedDrawer();

    const drawer = await screen.findByRole("dialog", { name: storyQueryDetail.query });
    expect(within(drawer).getByRole("heading", { level: 2 })).toHaveAccessibleName(
      storyQueryDetail.query,
    );
    const link = within(drawer).getByRole("link", {
      name: `Search Google for ${storyQueryDetail.query}`,
    });
    expect(link).toHaveAttribute("href", "https://www.google.com/search?q=rank+tracking+software");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAccessibleDescription(
      "Opens this search on Google. What you see can differ from what Search Console measured - results vary by location, device, and personalization.",
    );
    expect(link).toHaveClass(
      "h-6",
      "w-6",
      "shrink-0",
      "rounded-control",
      "border-border-control",
      "opacity-50",
      "hover:opacity-100",
      "focus-visible:opacity-100",
    );
  });

  it("does not add a Google search link to a page title", async () => {
    renderTrackedDrawer({
      entry: undefined,
      frame: {
        kind: "page",
        path: "/guides/rank-tracking",
        url: "https://example.com/guides/rank-tracking",
      },
    });

    const drawer = await screen.findByRole("dialog");
    expect(
      within(drawer).queryByRole("link", { name: /^Search Google for / }),
    ).not.toBeInTheDocument();
  });
});
