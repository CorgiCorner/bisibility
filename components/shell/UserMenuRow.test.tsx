import { Menu, MenuContent } from "@/components/ui/primitives/menu";
import { renderWithShellMessages as renderDom } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
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
    expect(resourceLinksForDeployment(false).map((item) => item.key)).toEqual(["docs", "feedback"]);
    expect(resourceLinksForDeployment(true).map((item) => item.key)).toEqual([
      "docs",
      "homepage",
      "feedback",
    ]);
  });

  it("offers one canonical homepage link instead of roadmap and changelog", () => {
    expect(resourceLinks.map((item) => item.key)).toEqual(["docs", "homepage", "feedback"]);

    const homepage = resourceLinks.find((item) => item.key === "homepage");
    expect(homepage).toBeDefined();
    if (!homepage) {
      throw new Error("Homepage resource link is missing");
    }

    render(<UserMenuRow item={{ ...homepage, label: "Homepage" }} />);

    const link = screen.getByRole("menuitem", {
      name: "Homepage (opens in a new tab)",
    });

    expect(link).toHaveAttribute("href", "https://bisibility.com");
    expect(link).toHaveAttribute("rel", "noopener");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("places Discord directly below GitHub in the community links", () => {
    expect(communityLinks.map((item) => item.key)).toEqual(["github", "discord"]);

    const discord = communityLinks[1];
    expect(discord).toBeDefined();
    if (!discord) {
      throw new Error("Discord community link is missing");
    }

    render(<UserMenuRow item={{ ...discord, label: "Discord" }} />);

    const link = screen.getByRole("menuitem", {
      name: "Discord (opens in a new tab)",
    });
    expect(link).toHaveAttribute("href", "https://discord.gg/HcYpvfn79w");
    expect(link).toHaveAttribute("rel", "noopener");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("exposes only Account settings in account links", () => {
    expect(accountLinks.map((item) => item.key)).toEqual(["accountSettings"]);
  });
});
