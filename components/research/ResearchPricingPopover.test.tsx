import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ResearchPricingPopover } from "./ResearchPricingPopover";

function PopoverHarness(
  props: Omit<React.ComponentProps<typeof ResearchPricingPopover>, "anchor" | "onClose">,
) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <button onClick={(event) => setAnchor(event.currentTarget)} type="button">
        open
      </button>
      <ResearchPricingPopover anchor={anchor} onClose={() => setAnchor(null)} {...props} />
    </>
  );
}

function rowLabels(): string[] {
  const container = document.querySelector("div.divide-y");
  expect(container).not.toBeNull();
  return Array.from(container?.children ?? []).map(
    (row) => row.querySelector("span")?.textContent ?? "",
  );
}

function rowValue(label: string): string {
  const labelEl = screen.getByText(label);
  const row = labelEl.closest("div.grid");
  expect(row).not.toBeNull();
  return row?.querySelectorAll("span")[1]?.textContent ?? "";
}

const baseHarnessProps = {
  includeClickstream: false,
  resultLimit: 100,
  seedCount: 1,
};

describe("ResearchPricingPopover", () => {
  it("renders three source rows in order for mode=auto", () => {
    render(<PopoverHarness {...baseHarnessProps} mode="auto" />);
    fireEvent.click(screen.getByRole("button", { name: "open" }));

    expect(rowLabels()).toEqual([
      "Related keywords",
      "Keyword suggestions",
      "Keyword ideas",
      "Repeat within 12 hours",
    ]);
  });

  it("renders exactly one source row for mode=related", () => {
    render(<PopoverHarness {...baseHarnessProps} mode="related" />);
    fireEvent.click(screen.getByRole("button", { name: "open" }));

    expect(rowLabels()).toEqual(["Related keywords", "Repeat within 12 hours"]);
  });

  it("doubles each row value with clickstream but adds no extra row", () => {
    const { unmount } = render(<PopoverHarness {...baseHarnessProps} mode="auto" />);
    fireEvent.click(screen.getByRole("button", { name: "open" }));

    const offRelated = rowValue("Related keywords");
    const offCount = document.querySelector("div.divide-y")?.children.length ?? 0;

    unmount();

    render(<PopoverHarness {...baseHarnessProps} mode="auto" includeClickstream />);
    fireEvent.click(screen.getByRole("button", { name: "open" }));

    const onRelated = rowValue("Related keywords");
    const onCount = document.querySelector("div.divide-y")?.children.length ?? 0;

    expect(onCount).toBe(offCount);
    expect(parseFloat(onRelated.replace(/[^0-9.]/g, ""))).toBe(
      parseFloat(offRelated.replace(/[^0-9.]/g, "")) * 2,
    );
  });

  it("puts the seed multiplier sentence in the footer while row values stay per seed", () => {
    const { unmount } = render(<PopoverHarness {...baseHarnessProps} mode="auto" seedCount={1} />);
    fireEvent.click(screen.getByRole("button", { name: "open" }));
    const perSeedRelated = rowValue("Related keywords");
    unmount();

    render(<PopoverHarness {...baseHarnessProps} mode="auto" seedCount={3} />);
    fireEvent.click(screen.getByRole("button", { name: "open" }));

    expect(rowValue("Related keywords")).toBe(perSeedRelated);
    expect(screen.getByText(/3 seeds are charged 3 times\./)).toBeInTheDocument();
  });
});
