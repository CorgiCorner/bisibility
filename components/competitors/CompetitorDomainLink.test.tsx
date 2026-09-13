import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CompetitorDomainLink } from "./CompetitorDomainLink";

describe("CompetitorDomainLink", () => {
  it("shows only the URL with its adjacent arrow in the dashboard variant", () => {
    render(
      <CompetitorDomainLink
        domain="example.org"
        label="Example competitor"
        variant="rank-tracker"
      />,
    );

    const link = screen.getByRole("link", { name: "https://example.org" });
    expect(link.textContent).toBe("https://example.org");
    expect(screen.queryByText("Example competitor")).not.toBeInTheDocument();
    expect(link).toHaveClass("inline-flex", "items-center", "gap-0.5", "whitespace-nowrap");
    expect(link.firstElementChild).toHaveClass("truncate");
    expect(link.firstElementChild?.nextElementSibling?.tagName.toLowerCase()).toBe("svg");
    expect(link).toHaveAttribute("href", "https://example.org");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")?.split(" ")).toContain("noopener");
  });

  it("preserves named competitor presentation outside the dashboard", () => {
    render(<CompetitorDomainLink domain="example.org" label="Example competitor" />);
    expect(screen.getByRole("link", { name: "Example competitor example.org" })).toHaveAttribute(
      "href",
      "https://example.org",
    );
    expect(screen.getByText("Example competitor")).toBeVisible();
    expect(screen.getByText("example.org")).toBeVisible();
  });
});
