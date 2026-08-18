import { SectionTitle } from "@/components/ui/SectionTitle";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("SectionTitle", () => {
  it("renders medium as a section heading with the semantic section type role", () => {
    render(<SectionTitle>Revenue</SectionTitle>);

    const heading = screen.getByRole("heading", { name: "Revenue", level: 2 });
    expect(heading).toHaveClass("text-ui-section", "font-semibold");
    expect(heading).toHaveStyle({ fontSize: "15px", fontWeight: "600", lineHeight: "1.35" });
  });

  it("keeps small and large on their existing variants", () => {
    render(
      <>
        <SectionTitle data-testid="sm" size="sm">
          Small
        </SectionTitle>
        <SectionTitle data-testid="lg" size="lg">
          Large
        </SectionTitle>
      </>,
    );

    expect(screen.getByTestId("sm")).toHaveClass(
      "text-" + "[13px]",
      "leading-snug",
      "font-semibold",
    );
    expect(screen.getByTestId("lg")).toHaveClass("text-lg", "leading-snug", "font-semibold");
  });

  it("keeps the semantic type role when a caller sets text color", () => {
    render(<SectionTitle className="text-fg-muted">Muted revenue</SectionTitle>);

    expect(screen.getByRole("heading", { name: "Muted revenue" })).toHaveClass(
      "text-ui-section",
      "text-fg-muted",
    );
  });

  it("keeps the semantic section role when a caller supplies a conflicting font size", () => {
    render(<SectionTitle className="text-lg">Compact revenue</SectionTitle>);

    const heading = screen.getByRole("heading", { name: "Compact revenue" });
    expect(heading).toHaveClass("text-ui-section");
    expect(heading).not.toHaveClass("text-lg");
    expect(heading).toHaveStyle({ fontSize: "15px", fontWeight: "600", lineHeight: "1.35" });
  });

  it("keeps caller font-size overrides on the non-semantic large variant", () => {
    render(
      <SectionTitle className="text-xl" size="lg">
        Service unavailable
      </SectionTitle>,
    );

    const heading = screen.getByRole("heading", { name: "Service unavailable" });
    expect(heading).toHaveClass("text-xl");
    expect(heading).not.toHaveClass("text-lg");
  });
});
