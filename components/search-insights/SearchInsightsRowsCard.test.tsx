import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SearchInsightsRowsCard, type SearchInsightsRowsCardProps } from "./SearchInsightsRowsCard";

function card(props: Partial<SearchInsightsRowsCardProps> = {}) {
  return (
    <SearchInsightsRowsCard
      caption="Stored rows"
      onCollapse={vi.fn()}
      onMore={vi.fn()}
      show={10}
      shown={10}
      title="Top queries"
      total={184}
      {...props}
    >
      <div>Rows</div>
    </SearchInsightsRowsCard>
  );
}

function section(title = "Top queries") {
  return screen.getByRole("heading", { name: title }).closest("section") as HTMLElement;
}

describe("SearchInsightsRowsCard", () => {
  it("keeps the truthful header counter passive and visually stable after expansion", () => {
    const { rerender } = render(card());
    const collapsedCounter = within(section()).getByText("10 of 184");

    expect(collapsedCounter.tagName).toBe("SPAN");
    expect(collapsedCounter).toHaveClass(
      "shrink-0",
      "px-2",
      "py-0.5",
      "font-sans tabular-nums",
      "text-ui-caption",
      "text-fg-muted",
    );
    expect(within(section()).queryByRole("button", { name: /10 of 184/ })).toBeNull();

    rerender(card({ show: 50, shown: 50 }));
    const expandedCounter = within(section()).getByText("50 of 184");

    expect(expandedCounter.tagName).toBe("SPAN");
    expect(expandedCounter.className).toBe(collapsedCounter.className);
    expect(within(section()).queryByRole("button", { name: /50 of 184/ })).toBeNull();
  });

  it("puts collapse before the remaining expansion action with a twelve pixel gap", () => {
    render(card({ show: 50, shown: 50 }));
    const cardSection = section();
    const collapse = within(cardSection).getByRole("button", { name: "Show top 10" });
    const more = within(cardSection).getByRole("button", { name: "Show all 184" });
    const footer = collapse.parentElement as HTMLElement;

    expect(footer).toHaveClass("gap-3");
    expect(footer).not.toHaveClass("border-t");
    expect(collapse.compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(footer).getByText("134 more stored, no provider cost")).toBeInTheDocument();
  });

  it("keeps collapse available at the fully expanded state without a zero remainder note", () => {
    render(card({ show: "all", shown: 184 }));
    const cardSection = section();
    const collapse = within(cardSection).getByRole("button", { name: "Show top 10" });
    const footer = collapse.parentElement as HTMLElement;

    expect(footer).not.toHaveClass("border-t");
    expect(within(footer).queryByRole("button", { name: /Show all|Show more/ })).toBeNull();
    expect(within(footer).queryByText(/0 more stored/)).toBeNull();
  });

  it.each(["Top queries", "Top pages"])(
    "relies on the final row divider above the %s footer",
    (title) => {
      render(card({ title }));
      const more = within(section(title)).getByRole("button", { name: "Show more" });

      expect(more.parentElement).not.toHaveClass("border-t");
    },
  );
});
