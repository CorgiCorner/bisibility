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
    expect(list).toHaveClass("w-fit", "mx-auto", "list-disc");
    expect(list.parentElement).toHaveClass("max-w-[430px]");
    const items = screen.getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "First point",
      "Second point",
      "Third point",
    ]);
  });

  it("keeps the description optional", () => {
    render(<EmptyState bullets={["Only bullet"]} title="No description" />);

    // Bullet list follows the title directly, so it gets the title gap.
    expect(screen.getByRole("list").parentElement).toHaveClass("mt-[7px]");
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
