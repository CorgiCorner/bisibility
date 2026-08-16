import { AccountShell } from "@/components/account/AccountShell";
import { AccountShellLoading } from "@/components/account/AccountShellLoading";
import { accountSections } from "@/components/account/account-sections";
import {
  settingsContentColumnClassName,
  settingsShellGridClassName,
} from "@/components/settings/shell/settings-layout";
import { routerMock } from "@/tests/next-navigation";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const loadingBoundaries = [
  { activeSection: "profile", name: "Profile" },
  { activeSection: "preferences", name: "Preferences" },
  { activeSection: "security", name: "Security" },
] as const;

function Shell({
  activeSection,
}: Readonly<{ activeSection: "profile" | "preferences" | "security" }>) {
  return (
    <AccountShell activeSection={activeSection}>
      <p data-testid="shell-body">Content for {activeSection}</p>
    </AccountShell>
  );
}

describe("AccountShell", () => {
  beforeEach(() => {
    routerMock.push.mockReset();
  });

  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("renders exactly three subnav links with canonical hrefs", () => {
    render(<Shell activeSection="profile" />);

    const links = screen.getAllByRole("link");
    const subnavLinks = links.filter((link) => link.hasAttribute("data-account-subnav-link"));

    expect(subnavLinks).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute("href", "/app/account");
    expect(screen.getByRole("link", { name: "Preferences" })).toHaveAttribute(
      "href",
      "/app/account/preferences",
    );
    expect(screen.getByRole("link", { name: "Security" })).toHaveAttribute(
      "href",
      "/app/account/security",
    );
  });

  it("marks only the active section with aria-current page and a single dot", () => {
    const { container } = render(<Shell activeSection="preferences" />);

    expect(screen.getByRole("link", { name: "Preferences" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Profile" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Security" })).not.toHaveAttribute("aria-current");

    const dots = container.querySelectorAll("[data-account-subnav-current-dot]");
    expect(dots).toHaveLength(1);
    expect(dots[0]).toHaveClass("absolute", "-left-2.5", "bg-accent-solid");
  });

  it("sets fill icon weight on the active section and regular on the rest", () => {
    const { container } = render(<Shell activeSection="security" />);

    const activeIcon = container.querySelector('[data-account-subnav-icon="security"]');
    const inactiveIcon = container.querySelector('[data-account-subnav-icon="profile"]');

    expect(activeIcon).toHaveAttribute("data-account-subnav-icon-weight", "fill");
    expect(inactiveIcon).toHaveAttribute("data-account-subnav-icon-weight", "regular");
  });

  it("renders three Phosphor SVG icons inside the subnav", () => {
    const { container } = render(<Shell activeSection="profile" />);

    const subnav = container.querySelector("[data-account-subnav]");
    expect(subnav?.querySelectorAll("[data-account-subnav-icon] svg")).toHaveLength(3);
  });

  it("uses Settings-compatible grid geometry and content column width", () => {
    const { container } = render(<Shell activeSection="profile" />);

    const shell = container.querySelector("[data-account-shell]");
    expect(shell).toHaveClass("mx-auto", "w-full", "max-w-[1040px]");
    expect(settingsShellGridClassName).toContain("lg:grid-cols-[200px_minmax(0,760px)]");
    expect(settingsContentColumnClassName).toBe("min-w-0 w-full max-w-[760px]");

    const subnav = container.querySelector("[data-account-subnav]");
    expect(subnav).toHaveClass(
      "sticky",
      "top-6",
      "hidden",
      "w-[200px]",
      "self-start",
      "flex-col",
      "gap-0.5",
      "pl-[14px]",
      "lg:flex",
    );
  });

  it("uses the inset accent outline for keyboard focus instead of a ring", () => {
    render(<Shell activeSection="profile" />);

    const currentLink = screen.getByRole("link", { name: "Profile" });

    expect(currentLink).toHaveClass(
      "focus-visible:outline",
      "focus-visible:outline-2",
      "focus-visible:-outline-offset-2",
      "focus-visible:outline-accent-solid",
    );
    expect(currentLink.className).not.toContain("ring");
  });

  it("does not render the old tab-bar container", () => {
    const { container } = render(<Shell activeSection="profile" />);

    expect(container.querySelector("header nav[aria-label='Account settings']")).toBeNull();
    expect(container.querySelector('[data-testid="account-header"]')).toBeNull();
  });

  it("uses MenuSelect as the mobile fallback and routes to the selected account section", async () => {
    const user = userEvent.setup();
    render(<Shell activeSection="profile" />);

    await user.click(screen.getByRole("button", { name: "Account section" }));
    await user.click(screen.getByRole("menuitem", { name: "Security" }));

    expect(routerMock.push).toHaveBeenCalledWith("/app/account/security");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it.each(accountSections.map((section) => [section.id, section.label, section.href] as const))(
    "activates $label correctly when it is the current section",
    (id, label, href) => {
      render(<Shell activeSection={id as "profile" | "preferences" | "security"} />);

      const link = screen.getByRole("link", { name: label });
      expect(link).toHaveAttribute("aria-current", "page");
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveClass("font-semibold");
      expect(link).not.toHaveClass("bg-nav-active");
    },
  );

  it.each(loadingBoundaries)(
    "$name loading boundary mirrors the desktop sidebar and mobile selector geometry",
    ({ activeSection }) => {
      const { container } = render(
        <AccountShellLoading activeSection={activeSection}>{null}</AccountShellLoading>,
      );

      const boundary = container.querySelector("[data-account-loading-boundary]");
      expect(boundary).toHaveAttribute("data-account-loading-boundary", activeSection);
      expect(boundary?.children).toHaveLength(2);
      expect(boundary?.firstElementChild).toHaveAttribute("data-account-loading-mobile-menu", "");
      expect(boundary?.lastElementChild).toHaveAttribute("data-account-loading-grid", "");

      const subnav = boundary?.querySelector("[data-account-loading-subnav]");
      expect(subnav).toHaveClass(
        "sticky",
        "top-6",
        "hidden",
        "w-[200px]",
        "self-start",
        "flex-col",
        "gap-0.5",
        "pl-[14px]",
        "lg:flex",
      );

      const rows = subnav?.querySelectorAll("[data-account-loading-subnav-row]");
      expect(rows).toHaveLength(3);

      const activeRows = subnav?.querySelectorAll('[data-account-loading-subnav-active="true"]');
      expect(activeRows).toHaveLength(1);
      expect(activeRows?.[0]).toHaveAttribute("data-account-loading-subnav-row", activeSection);

      const dots = subnav?.querySelectorAll("[data-account-loading-subnav-active-dot]");
      expect(dots).toHaveLength(1);

      const iconSlots = subnav?.querySelectorAll("[data-account-loading-subnav-icon-slot]");
      expect(iconSlots).toHaveLength(3);
      for (const slot of iconSlots ?? []) {
        expect(slot).toHaveClass("h-[30px]", "w-[30px]");
      }

      expect(
        boundary?.querySelector("[data-account-loading-mobile-menu] [data-account-loading-bar]"),
      ).toHaveClass("h-[34px]", "w-full");
    },
  );
});
