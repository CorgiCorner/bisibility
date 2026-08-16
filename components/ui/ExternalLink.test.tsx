import { ExternalLink } from "@/components/ui/ExternalLink";
import { DOCS_URL } from "@/lib/site/site";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("ExternalLink", () => {
  it("resolves /docs targets through the canonical docs URL in a new tab", () => {
    render(<ExternalLink href="/docs/quickstart">Docs quickstart</ExternalLink>);

    const link = screen.getByRole("link", { name: "Docs quickstart" });
    expect(link).toHaveAttribute("href", `${DOCS_URL}/quickstart`);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer noopener");
    const svg = link.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps non-docs targets and applies safe external defaults", () => {
    render(
      <ExternalLink href="https://example.com/rank-tracking-cost-calculator">
        Estimate future cost
      </ExternalLink>,
    );

    const link = screen.getByRole("link", { name: "Estimate future cost" });
    expect(link).toHaveAttribute("href", "https://example.com/rank-tracking-cost-calculator");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer noopener");
    const svg = link.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });
});
