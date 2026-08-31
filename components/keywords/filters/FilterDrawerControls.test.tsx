import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FilterCheckTile, FilterSegment } from "./FilterDrawerControls";

function renderTile(active: boolean) {
  render(<FilterCheckTile active={active} label="Top 3" onClick={vi.fn()} />);
  const tile = screen.getByRole("button", { name: "Top 3" });
  const checkbox = tile.querySelector("span");

  expect(checkbox).not.toBeNull();
  return { checkbox: checkbox as HTMLElement, tile };
}

describe("FilterCheckTile", () => {
  it("uses the control border token for its inactive tile and checkbox", () => {
    const { checkbox, tile } = renderTile(false);

    expect(tile).toHaveClass("border-border-control");
    expect(checkbox).toHaveClass("border-border-control");
    expect(tile).toHaveClass("hover:border-accent", "focus-visible:border-accent");
  });

  it("uses accent borders for its active tile and checkbox", () => {
    const { checkbox, tile } = renderTile(true);

    expect(tile).toHaveClass("border-accent");
    expect(checkbox).toHaveClass("border-accent");
    expect(tile).toHaveClass("hover:border-accent", "focus-visible:border-accent");
  });
});

type SegmentValue = "any" | "up" | "down" | "new" | "lost";

const segmentOptions = [
  { id: "any", label: "Any" },
  { id: "up", label: "Up" },
  { id: "down", label: "Down" },
] as const;

describe("FilterSegment", () => {
  it("uses canonical radio semantics, toolbar styling, and selected state", () => {
    render(
      <FilterSegment<SegmentValue>
        ariaLabel="Position change"
        onChange={() => {}}
        options={segmentOptions}
        value="up"
      />,
    );

    const group = screen.getByRole("radiogroup", { name: "Position change" });
    const selected = screen.getByRole("radio", { name: "Up" });
    const control = selected.parentElement?.parentElement;
    const selectedSurface = selected.nextElementSibling;

    expect(group).toBeInTheDocument();
    expect(selected).toBeChecked();
    expect(control).toHaveClass("border-border-control");
    expect(selectedSurface).toHaveClass(
      "border-border-control",
      "bg-nav-active",
      "text-[12.5px]",
      "font-normal",
    );
  });

  it("calls onChange when a radio is selected", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FilterSegment<SegmentValue>
        ariaLabel="Position change"
        onChange={onChange}
        options={segmentOptions}
        value="any"
      />,
    );

    await user.click(screen.getByRole("radio", { name: "Down" }));

    expect(onChange).toHaveBeenCalledWith("down");
  });

  it("supports radio arrow-key selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FilterSegment<SegmentValue>
        ariaLabel="Position change"
        onChange={onChange}
        options={segmentOptions}
        value="any"
      />,
    );

    screen.getByRole("radio", { name: "Any" }).focus();
    await user.keyboard("{ArrowRight}");

    expect(onChange).toHaveBeenCalledWith("up");
    expect(screen.getByRole("radio", { name: "Up" })).toHaveFocus();
  });

  it("wraps five options into the canonical three-column grid", () => {
    const fiveOptions = [
      ...segmentOptions,
      { id: "new", label: "New" },
      { id: "lost", label: "Lost" },
    ] as const;
    render(
      <FilterSegment<SegmentValue>
        ariaLabel="Position change"
        onChange={() => {}}
        options={fiveOptions}
        value="any"
      />,
    );

    const group = screen.getByRole("radiogroup", { name: "Position change" });
    expect(group).toHaveClass("[&>fieldset>div]:!grid-cols-3");
    expect(screen.getAllByRole("radio")).toHaveLength(5);
  });
});
