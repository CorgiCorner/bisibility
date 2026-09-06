import { settingsSectionHref } from "@/components/settings/shell/settings-sections";
import { appPath } from "@/lib/routing/app-path";
import { GITHUB_URL } from "@/lib/site/site";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GoFurtherCards } from "./GoFurtherCards";

const projectRef = "prj_abcdefghijklmnopqrstuvwx";

describe("GoFurtherCards", () => {
  it("renders the approved copy and real destinations", () => {
    render(<GoFurtherCards projectRef={projectRef} />);

    expect(screen.getByRole("heading", { name: "Go further" })).toHaveClass(
      "font-sans tabular-nums",
      "text-[10px]",
      "uppercase",
    );
    expect(screen.getByRole("link", { name: /Invite teammates/ })).toHaveAttribute(
      "href",
      settingsSectionHref(projectRef, "team"),
    );
    expect(screen.getByRole("link", { name: /Connect an AI assistant/ })).toHaveAttribute(
      "href",
      appPath(projectRef, "install"),
    );
    expect(screen.getByRole("link", { name: /Connect an AI assistant/ })).not.toHaveAttribute(
      "target",
    );
    expect(screen.getByText("Invite teammates and assign roles.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Connect an AI assistant/ })).not.toHaveAttribute(
      "target",
    );
    expect(screen.getByText("Connect Claude, ChatGPT or any MCP client.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Star bisibility on GitHub/ })).toHaveAttribute(
      "href",
      GITHUB_URL,
    );
  });

  it("uses the exact regular 17px icons without legacy or arrow glyphs", () => {
    const { container } = render(<GoFurtherCards projectRef={projectRef} />);

    for (const iconName of ["UserPlus", "Sparkle", "Star"]) {
      const icon = container.querySelector(`[data-go-further-icon="${iconName}"]`);
      expect(icon).toHaveAttribute("width", "17");
      expect(icon).toHaveAttribute("height", "17");
    }
    expect(container.querySelector('[data-go-further-icon="Robot"]')).toBeNull();
    expect(container.querySelector('[data-go-further-icon="UsersThree"]')).toBeNull();
    expect(container.querySelector('[data-go-further-icon="GithubLogo"]')).toBeNull();
    expect(container.querySelector('[data-go-further-icon="ArrowUpRight"]')).toBeNull();
  });

  it("opens only the external GitHub card safely", () => {
    render(<GoFurtherCards projectRef={projectRef} />);

    expect(screen.getByRole("link", { name: /Invite teammates/ })).not.toHaveAttribute("target");
    expect(screen.getByRole("link", { name: /Connect an AI assistant/ })).not.toHaveAttribute(
      "target",
    );
    expect(screen.getByRole("link", { name: /Star bisibility on GitHub/ })).toHaveAttribute(
      "target",
      "_blank",
    );
    expect(screen.getByRole("link", { name: /Star bisibility on GitHub/ })).toHaveAttribute(
      "rel",
      "noreferrer noopener",
    );
  });

  it("keeps user-visible copy free of U+2014", () => {
    const { container } = render(<GoFurtherCards projectRef={projectRef} />);
    expect(container.textContent).not.toContain("\u2014");
  });
});
