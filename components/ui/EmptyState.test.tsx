import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("supports structured shared descriptions", () => {
    render(
      <EmptyState
        description={
          <ul>
            <li>First explanation</li>
            <li>Second explanation</li>
          </ul>
        }
        title="Empty"
      />,
    );

    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getByRole("list").parentElement?.tagName).toBe("DIV");
    expect(screen.getByRole("list").parentElement).toHaveClass("mt-[7px]");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("renders bullets as a first-class centered list", () => {
    render(
      <EmptyState bullets={["First point", "Second point", "Third point"]} title="Bulleted" />,
    );

    const list = screen.getByRole("list");
    expect(list.tagName).toBe("UL");
    expect(list).toHaveClass("w-fit", "mx-auto", "list-none", "p-0");
    expect(list).not.toHaveClass("list-disc");
    const checks = list.querySelectorAll('svg[data-empty-state-bullet="true"]');
    expect(checks).toHaveLength(3);
    for (const check of checks) {
      expect(check).toHaveClass(
        "self-center",
        "[color:color-mix(in_srgb,var(--fg-muted)_60%,transparent)]",
      );
      expect(check).not.toHaveClass("mt-[2px]", "text-accent-solid");
      expect(check).toHaveAttribute("data-empty-state-bullet-kind", "check");
    }
    expect(list.parentElement).toHaveClass("max-w-[430px]");
    const items = screen.getAllByRole("listitem");
    for (const item of items) expect(item).toHaveClass("gap-2.5");
    expect(items.map((item) => item.textContent)).toEqual([
      "First point",
      "Second point",
      "Third point",
    ]);
  });

  it("keeps the description optional", () => {
    render(<EmptyState bullets={["Only bullet"]} title="No description" />);

    // Bullet list follows the title directly, so it gets the title gap.
    expect(screen.getByRole("list").parentElement).toHaveClass("mt-2.5");
    expect(screen.getByText("No description")).toBeInTheDocument();
  });

  it("tightens bullet spacing when a description precedes it", () => {
    render(
      <EmptyState bullets={["Follow-up bullet"]} description="Leading description" title="Both" />,
    );

    expect(screen.getByText("Leading description")).toBeInTheDocument();
    expect(screen.getByRole("list").parentElement).toHaveClass("mt-1.5");
  });

  it("renders neither block when no copy is supplied", () => {
    render(<EmptyState title="Bare" />);

    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByText("Bare")).toBeInTheDocument();
  });

  it("renders a mark directly and spaces the heading as media", () => {
    render(<EmptyState mark={<div data-testid="module-mark" />} title="Marked" />);

    const mark = screen.getByTestId("module-mark");
    const heading = screen.getByRole("heading", { name: "Marked" });
    expect(mark.parentElement).toBe(heading.parentElement);
    expect(mark.nextElementSibling).toBe(heading);
    expect(heading).toHaveClass("mt-4.5");
  });

  it("keeps compact media spacing for a direct mark", () => {
    render(<EmptyState compact mark={<div data-testid="compact-mark" />} title="Compact" />);

    expect(screen.getByRole("heading", { name: "Compact" })).toHaveClass("mt-2.5");
  });

  it("renders the mono footnote after the action", () => {
    render(
      <EmptyState
        action={<button type="button">Do it</button>}
        description="Copy"
        footnote="Activates later"
        title="With footnote"
      />,
    );

    const footnote = screen.getByText("Activates later");
    expect(footnote).toHaveClass("font-mono");
    const button = screen.getByRole("button", { name: "Do it" });
    expect(
      button.compareDocumentPosition(footnote) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
