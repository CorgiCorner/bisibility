import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SAMPLE_DATA_BUTTON_TOOLTIP, SampleDataButton } from "./SampleDataButton";

vi.mock("@/lib/actions/sample-data", () => ({
  installSampleData: vi.fn(),
}));

describe("SampleDataButton", () => {
  it("puts the skip-setup help on the action button itself", () => {
    render(<SampleDataButton help={SAMPLE_DATA_BUTTON_TOOLTIP} variant="secondary" />);

    const button = screen.getByRole("button", { name: "Load sample project" });
    expect(button).toHaveClass("MuiButton-outlined");
    const describedBy = button.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy ?? "")).toHaveTextContent(
      SAMPLE_DATA_BUTTON_TOOLTIP,
    );
    expect(
      screen.queryByRole("button", { name: SAMPLE_DATA_BUTTON_TOOLTIP }),
    ).not.toBeInTheDocument();
  });

  it("omits the help control when no help is provided", () => {
    render(<SampleDataButton />);

    expect(screen.getByRole("button", { name: "Load sample project" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: SAMPLE_DATA_BUTTON_TOOLTIP }),
    ).not.toBeInTheDocument();
  });
});
