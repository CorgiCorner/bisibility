import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatTile } from "./StatTile";

describe("StatTile", () => {
  it("keeps the value tabular and shows a directional delta", () => {
    render(
      <StatTile
        caption="from 10"
        delta={{ direction: "up", label: "+2" }}
        label="Clicks"
        source="GSC"
        value="12"
      />,
    );

    expect(screen.getByText("12")).toHaveClass("tabular-nums", "text-ui-h1");
    expect(screen.getByText("+2")).toHaveClass("text-green-text");
    expect(screen.getByText("Clicks")).not.toHaveClass("truncate");
    expect(screen.getByText("GSC")).toBeVisible();
  });

  it("uses the compact value size and a muted empty value", () => {
    const { rerender } = render(<StatTile density="compact" label="Pages" value="4" />);
    expect(screen.getByText("4")).toHaveClass("text-ui-body", "font-semibold", "tabular-nums");

    rerender(<StatTile empty label="Custom" value="No data" />);
    expect(screen.getByText("No data")).toHaveClass("text-fg-muted");
    expect(screen.getByText("No data")).not.toHaveClass("text-ui-h1");
  });
});
