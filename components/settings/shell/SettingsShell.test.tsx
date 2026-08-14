import { AdvancedSettingsLoading } from "@/components/settings/advanced/AdvancedSettingsLoading";
import { DevelopersLoading } from "@/components/settings/developers/DevelopersLoading";
import { GeneralSettingsRouteLoading } from "@/components/settings/general/GeneralSettingsLoading";
import { NotificationsRouteLoading } from "@/components/settings/notifications/NotificationsLoading";
import { LegacySettingsHashRedirect } from "@/components/settings/shell/LegacySettingsHashRedirect";
import { SettingsCard } from "@/components/settings/shell/SettingsCard";
import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import {
  FieldWidths as FieldWidthsStory,
  Loading as LoadingStory,
} from "@/components/settings/shell/SettingsShell.stories";
import { SettingsShellLoading } from "@/components/settings/shell/SettingsShellLoading";
import {
  SettingsField,
  settingsFieldWidths,
} from "@/components/settings/shell/settings-field-widths";
import {
  settingsCardGeometryClassNames,
  settingsShellGridClassName,
} from "@/components/settings/shell/settings-layout";
import {
  legacySettingsHashMap,
  resolveLegacySettingsHash,
} from "@/components/settings/shell/settings-sections";
import { TeamSettingsLoading } from "@/components/settings/team/TeamSettingsLoading";
import { TrackingSettingsRouteLoading } from "@/components/settings/tracking/TrackingSettingsLoading";
import { UsageLoading } from "@/components/settings/usage/UsageLoading";
import { routerMock } from "@/tests/next-navigation";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const projectRef = "prj_7Kd2Qf9m";

const loadingBoundaries = [
  {
    activeSection: "general",
    name: "generic Settings shell",
    render: () => <SettingsShellLoading />,
  },
  {
    activeSection: "general",
    name: "General",
    render: () => <GeneralSettingsRouteLoading />,
  },
  {
    activeSection: "tracking",
    name: "Tracking",
    render: () => <TrackingSettingsRouteLoading />,
  },
  {
    activeSection: "notifications",
    name: "Notifications",
    render: () => <NotificationsRouteLoading />,
  },
  { activeSection: "developers", name: "Developers", render: () => <DevelopersLoading /> },
  { activeSection: "usage", name: "Usage & billing", render: () => <UsageLoading /> },
  { activeSection: "team", name: "Team", render: () => <TeamSettingsLoading /> },
  { activeSection: "advanced", name: "Advanced", render: () => <AdvancedSettingsLoading /> },
] as const;

function Shell() {
  return (
    <SettingsShell activeSection="developers" projectRef={projectRef}>
      <SettingsCard title="Developer access">Ready for developer controls.</SettingsCard>
    </SettingsShell>
  );
}

describe("SettingsShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("renders the mapped icons, active weight, and a single outboard current dot", () => {
    const { container } = render(<Shell />);
    const subnav = container.querySelector("[data-settings-subnav]");

    expect(settingsShellGridClassName).toContain("lg:grid-cols-[200px_minmax(0,760px)]");
    expect(subnav).toHaveClass("sticky", "top-6", "w-[200px]", "flex-col", "gap-0.5", "pl-[14px]");
    expect(screen.getByRole("link", { name: "Developers" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(subnav?.querySelectorAll("[data-settings-subnav-icon] svg")).toHaveLength(7);
    expect(screen.queryByRole("link", { name: "Markets" })).not.toBeInTheDocument();
    expect(subnav?.querySelector('[data-settings-subnav-icon="developers"]')).toHaveAttribute(
      "data-settings-subnav-icon-weight",
      "fill",
    );
    expect(subnav?.querySelector('[data-settings-subnav-icon="general"]')).toHaveAttribute(
      "data-settings-subnav-icon-weight",
      "regular",
    );
    expect(subnav?.querySelectorAll("[data-settings-subnav-current-dot]")).toHaveLength(1);
    expect(subnav?.querySelector("[data-settings-subnav-current-dot]")).toHaveClass(
      "absolute",
      "-left-2.5",
      "bg-accent-solid",
    );
    expect(subnav?.querySelectorAll(".rounded-full")).toHaveLength(1);
    expect(subnav?.querySelector(".bg-border-strong")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Developers" })).toHaveClass("font-semibold");
    expect(screen.getByRole("link", { name: "Developers" })).not.toHaveClass("bg-nav-active");
  });

  it("uses the inset accent outline for keyboard focus instead of a ring", () => {
    render(<Shell />);

    const currentLink = screen.getByRole("link", { name: "Developers" });

    expect(currentLink).toHaveClass(
      "focus-visible:outline",
      "focus-visible:outline-2",
      "focus-visible:-outline-offset-2",
      "focus-visible:outline-accent-solid",
    );
    expect(currentLink.className).not.toContain("ring");
  });

  it("keeps documentation routes and repeated section labels out of the app shell", () => {
    render(<Shell />);

    expect(screen.queryByText("/settings/developers")).not.toBeInTheDocument();
  });

  it("uses MenuSelect as the mobile fallback and routes through the selected section", async () => {
    const user = userEvent.setup();
    render(<Shell />);

    await user.click(screen.getByRole("button", { name: "Settings section" }));
    await user.click(screen.getByRole("menuitem", { name: "Advanced" }));

    expect(routerMock.push).toHaveBeenCalledWith("/app/prj_7Kd2Qf9m/settings/advanced");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("keeps loading and settled card frames on the same geometry contract", () => {
    const { container } = render(
      <>
        <SettingsCard className={settingsCardGeometryClassNames.form} title="Settled">
          Settled content.
        </SettingsCard>
        <SettingsShellLoading />
      </>,
    );
    const settled = container.querySelector('[data-settings-card-frame="settled"]');
    const frames = Array.from(container.querySelectorAll("[data-settings-loading-frame]"));

    expect(settled).toBeInTheDocument();
    expect(frames).toHaveLength(2);
    expect(settled).toHaveClass(
      "max-w-[760px]",
      "min-h-[376px]",
      "rounded-2xl",
      "p-5",
      "lg:min-h-0",
      "lg:h-[324px]",
    );
    expect(frames[0]).toHaveClass(
      "max-w-[760px]",
      "min-h-[376px]",
      "rounded-2xl",
      "p-5",
      "lg:min-h-0",
      "lg:h-[324px]",
    );
    expect(frames[1]).toHaveClass("h-[219px]", "lg:h-[226px]");
    expect(container.querySelector("[data-settings-loading-route-header]")).not.toBeInTheDocument();
  });

  it.each(loadingBoundaries)(
    "$name uses the shared route frame without a stale pathname header",
    ({ activeSection, render: renderBoundary }) => {
      const { container } = render(renderBoundary());
      const boundary = container.querySelector("[data-settings-loading-boundary]");
      const subnav = boundary?.querySelector("[data-settings-loading-subnav]");
      const rows = subnav?.querySelectorAll("[data-settings-loading-subnav-row]");
      const activeRows = subnav?.querySelectorAll('[data-settings-loading-subnav-active="true"]');

      expect(boundary).toHaveAttribute("data-settings-loading-boundary", activeSection);
      expect(boundary?.children).toHaveLength(2);
      expect(boundary?.firstElementChild).toHaveAttribute("data-settings-loading-mobile-menu", "");
      expect(boundary?.lastElementChild).toHaveAttribute("data-settings-loading-grid", "");
      expect(
        boundary?.querySelector("[data-settings-loading-mobile-menu] [data-settings-loading-bar]"),
      ).toHaveClass("h-[34px]", "w-full");
      expect(
        boundary?.querySelector("[data-settings-loading-route-header]"),
      ).not.toBeInTheDocument();
      expect(settingsShellGridClassName).toContain("lg:grid-cols-[200px_minmax(0,760px)]");
      expect(boundary?.querySelectorAll("[data-settings-loading-subnav]")).toHaveLength(1);
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
      expect(rows).toHaveLength(7);
      expect(subnav?.querySelectorAll("[data-settings-loading-subnav-icon-slot]")).toHaveLength(7);
      expect(activeRows).toHaveLength(1);
      expect(activeRows?.[0]).toHaveAttribute("data-settings-loading-subnav-row", activeSection);
      expect(subnav?.querySelectorAll("[data-settings-loading-subnav-active-dot]")).toHaveLength(1);
      expect(subnav?.querySelector("[data-settings-loading-subnav-active-dot]")).toHaveClass(
        "absolute",
        "-left-2.5",
        "h-1.5",
        "w-1.5",
      );

      for (const row of rows ?? []) {
        expect(row).toHaveClass("h-10", "gap-2.5", "rounded-[9px]", "px-[11px]");
      }
      for (const iconSlot of subnav?.querySelectorAll("[data-settings-loading-subnav-icon-slot]") ??
        []) {
        expect(iconSlot).toHaveClass("h-[30px]", "w-[30px]");
      }
    },
  );

  it("publishes the field width tokens as semantic markers", () => {
    const { container } = render(
      <>
        <SettingsField width="field" />
        <SettingsField width="full" />
      </>,
    );

    expect(container.querySelector('[data-settings-field-width="field"]')).toHaveClass(
      "max-w-[340px]",
    );
    expect(container.querySelector('[data-settings-field-width="full"]')).toHaveClass(
      "max-w-[640px]",
    );
  });

  // Settings offers ONE input width. A second one is how the page drifted back to a column of
  // controls that stepped between 240px, 260px and 400px, so the token set is asserted here.
  it("offers a single input width next to the card-wide one", () => {
    expect([...Object.keys(settingsFieldWidths)].sort()).toEqual(["field", "full"]);
    expect(settingsFieldWidths.field).toBe(340);
  });

  it("gives isolated Storybook states truthful level-one headings", () => {
    const fieldWidthsRender = FieldWidthsStory.render;
    const loadingRender = LoadingStory.render;

    expect(fieldWidthsRender).toBeDefined();
    expect(loadingRender).toBeDefined();

    render(
      <>
        {fieldWidthsRender?.({} as never, {} as never)}
        {loadingRender?.({} as never, {} as never)}
      </>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Settings field widths" })).toHaveClass(
      "sr-only",
    );
    expect(screen.getByRole("heading", { level: 1, name: "Settings loading state" })).toHaveClass(
      "sr-only",
    );
  });

  it("maps every legacy section hash to a settings route", () => {
    expect(legacySettingsHashMap).toEqual({
      "#api-keys": "developers",
      "#migration": "advanced",
      "#provider-usage": "usage",
      "#usage-billing": "usage",
    });
    expect(resolveLegacySettingsHash("#api-keys")).toBe("developers");
    expect(resolveLegacySettingsHash("#unknown")).toBeUndefined();
  });

  it.each(Object.entries(legacySettingsHashMap))(
    "redirects legacy hash %s client-side after the new route has rendered",
    (hash, section) => {
      window.history.replaceState({}, "", `/app/${projectRef}/settings/general${hash}`);
      render(<LegacySettingsHashRedirect projectRef={projectRef} />);

      expect(routerMock.replace).toHaveBeenCalledWith(`/app/${projectRef}/settings/${section}`);
    },
  );
});
