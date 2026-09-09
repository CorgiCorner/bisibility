import { Card } from "@/components/ui/Card";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("Card", () => {
  it("maps each size to its semantic radius and preserved padding", () => {
    render(
      <>
        <Card data-testid="sm" size="sm">
          Small
        </Card>
        <Card data-testid="md" size="md">
          Medium
        </Card>
        <Card data-testid="lg" size="lg">
          Large
        </Card>
      </>,
    );

    expect(screen.getByTestId("sm")).toHaveClass("rounded-card", "p-3");
    expect(screen.getByTestId("md")).toHaveClass("rounded-card", "p-4");
    expect(screen.getByTestId("lg")).toHaveClass("rounded-card", "p-5");
  });

  it("defaults to the medium size", () => {
    render(<Card data-testid="default">Default</Card>);

    expect(screen.getByTestId("default")).toHaveClass("rounded-card", "p-4");
  });

  it("supports an intentional semantic radius override", () => {
    render(
      <Card data-testid="override" radius="card" size="lg">
        Override
      </Card>,
    );

    expect(screen.getByTestId("override")).toHaveClass("rounded-card", "p-5");
  });

  it("lets caller style override the semantic radius", () => {
    render(
      <Card data-testid="style-override" style={{ borderRadius: "12px" }}>
        Override
      </Card>,
    );
  });
});
