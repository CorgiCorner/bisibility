import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UserMenuRow } from "./UserMenuRow";
import { resourceLinks, resourceLinksForDeployment } from "./user-menu-items";

describe("UserMenuRow", () => {
  it("hides the managed homepage link on self-hosted deployments", () => {
    expect(resourceLinksForDeployment(false).map((item) => item.label)).toEqual([
      "Docs & self-hosting",
      "Send feedback",
    ]);
    expect(resourceLinksForDeployment(true).map((item) => item.label)).toEqual([
      "Docs & self-hosting",
      "Homepage",
      "Send feedback",
    ]);
  });

  it("offers one canonical homepage link instead of roadmap and changelog", () => {
    expect(resourceLinks.map((item) => item.label)).toEqual([
      "Docs & self-hosting",
      "Homepage",
      "Send feedback",
    ]);

    const homepage = resourceLinks.find((item) => item.label === "Homepage");
    expect(homepage).toBeDefined();
    if (!homepage) {
      throw new Error("Homepage resource link is missing");
    }

    render(<UserMenuRow item={homepage} />);

    const link = screen.getByRole("menuitem", {
      name: "Homepage (opens in a new tab)",
    });

    expect(link).toHaveAttribute("href", "https://bisibility.com");
    expect(link).toHaveAttribute("rel", "noopener");
    expect(link).toHaveAttribute("target", "_blank");
  });
});
