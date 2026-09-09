import { Menu, MenuContent } from "@/components/ui/primitives/menu";
import { render as renderDom, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { USER_MENU_ROW_STYLE, UserMenuRow } from "./UserMenuRow";
import {
  accountLinks,
  communityLinks,
  resourceLinks,
  resourceLinksForDeployment,
} from "./user-menu-items";

function render(children: ReactNode) {
  return renderDom(
    <Menu open>
      <MenuContent>{children}</MenuContent>
    </Menu>,
  );
}

describe("UserMenuRow", () => {
  it("uses the sunken surface for account-menu hover and keyboard focus", () => {
    expect(USER_MENU_ROW_STYLE["--control-hover-background-color"]).toBe("var(--bg-sunken)");
    expect(USER_MENU_ROW_STYLE["--control-focus-background-color"]).toBe("var(--bg-sunken)");
  });

  it("hides the managed homepage link on self-hosted deployments", () => {
    expect(resourceLinksForDeployment(false).map((item) => item.label)).toEqual([
      "Docs and self-hosting",
      "Send feedback",
    ]);
    expect(resourceLinksForDeployment(true).map((item) => item.label)).toEqual([
      "Docs and self-hosting",
      "Homepage",
      "Send feedback",
    ]);
  });

  it("offers one canonical homepage link instead of roadmap and changelog", () => {
    expect(resourceLinks.map((item) => item.label)).toEqual([
      "Docs and self-hosting",
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

  it("places Discord directly below GitHub in the community links", () => {
    expect(communityLinks.map((item) => item.label)).toEqual(["GitHub", "Discord"]);

    const discord = communityLinks[1];
    expect(discord).toBeDefined();
    if (!discord) {
      throw new Error("Discord community link is missing");
    }

    render(<UserMenuRow item={discord} />);

    const link = screen.getByRole("menuitem", {
      name: "Discord (opens in a new tab)",
    });
    expect(link).toHaveAttribute("href", "https://discord.gg/HcYpvfn79w");
    expect(link).toHaveAttribute("rel", "noopener");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("exposes only Account settings in account links", () => {
    expect(accountLinks.map((item) => item.label)).toEqual(["Account settings"]);
  });
});
