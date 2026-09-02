import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import GettingStartedLoading from "./loading";

describe("GettingStartedLoading", () => {
  it("matches the final page anatomy without exposing loading copy", () => {
    const { container } = render(<GettingStartedLoading />);

    const content = container.firstElementChild;
    expect(content).toHaveClass("mx-auto", "max-w-[1040px]");
    expect(content).not.toHaveClass("max-w-[1400px]");
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(12);
    expect(container.querySelectorAll("section")).toHaveLength(3);
    expect(container.querySelector('[data-testid="getting-started-loading-grid"]')).toHaveClass(
      "lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]",
    );
    expect(container.textContent).toBe("");
  });
});
