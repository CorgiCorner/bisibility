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
    expect(screen.getByTestId("lg")).toHaveClass("rounded-card-lg", "p-5");
    expect(screen.getByTestId("sm")).toHaveStyle({ borderRadius: "14px" });
    expect(screen.getByTestId("md")).toHaveStyle({ borderRadius: "14px" });
    expect(screen.getByTestId("lg")).toHaveStyle({ borderRadius: "16px" });
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
    expect(screen.getByTestId("override")).not.toHaveClass("rounded-card-lg");
    expect(screen.getByTestId("override")).toHaveStyle({ borderRadius: "14px" });
  });

  it("lets caller sx override the semantic radius", () => {
    render(
      <Card data-testid="sx-override" sx={{ borderRadius: "13px" }}>
        Override
      </Card>,
    );

    expect(screen.getByTestId("sx-override")).toHaveStyle({ borderRadius: "13px" });
  });
});
