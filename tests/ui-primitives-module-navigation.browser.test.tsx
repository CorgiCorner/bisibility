/// <reference types="vite/client" />
import "@/app/globals.css";
import "@/.storybook/preview-fonts.css";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { SidebarNav } from "@/components/shell/SidebarNav";
import { shellFeatureTestMessages } from "@/i18n/test-support/feature-test-messages";
import { applyTheme } from "@/lib/theme/browser-theme";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { page } from "vitest/browser";

afterEach(() => {
  cleanup();
  applyTheme("light");
});

const viewports = [
  { width: 1440, height: 900, collapsed: false },
  { width: 834, height: 900, collapsed: true },
  { width: 390, height: 900, collapsed: false },
] as const;
const themes = ["light", "dark"] as const;

it.each(viewports.flatMap((viewport) => themes.map((theme) => ({ ...viewport, theme }))))(
  "keeps module rows aligned without maturity labels at $width/$theme",
  async ({ width, height, collapsed, theme }) => {
    await page.viewport(width, height);
    applyTheme(theme);
    render(
      <FeatureMessagesProvider locale="en" messages={shellFeatureTestMessages} timeZone="UTC">
        <div className="min-h-[900px] bg-bg text-fg">
          <div className={collapsed ? "w-20 bg-bg-sidebar" : "w-[270px] bg-bg-sidebar p-3.5"}>
            <SidebarNav
              activeHref="/app/prj_1/search-console"
              collapsed={collapsed}
              enabledExperimentalModules={["timeline", "competitors"]}
              projectRef="prj_1"
            />
          </div>
        </div>
      </FeatureMessagesProvider>,
    );

    expect(screen.queryAllByText(/^(alpha|beta)$/i)).toHaveLength(0);
    expect(screen.getByRole("link", { name: "Search Console" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Alerts" })).toHaveAttribute(
      "href",
      "/app/prj_1/alerts",
    );
    expect(screen.getByRole("link", { name: "Competitors" })).toBeInTheDocument();
    const headings = [...document.querySelectorAll<HTMLElement>("[data-rail-group-heading]")];
    expect(headings.map((heading) => heading.dataset.railGroupHeading)).toEqual([
      "tracking",
      "research",
      "reports",
      "project",
    ]);
    const reportRow = screen.getByRole("link", { name: "Agent Reports" });
    expect(reportRow.parentElement?.parentElement).toBe(headings[2].parentElement?.parentElement);
    expect(screen.queryByRole("link", { name: "Project Context" })).not.toBeInTheDocument();
    const rows = screen.getAllByRole("link");
    const iconCenters = rows.map((row) => {
      const bounds = row.getBoundingClientRect();
      expect(bounds.height).toBe(36);
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(width);
      const icon = row.querySelector<SVGElement>("[data-nav-icon]");
      if (!icon) throw new Error("Navigation icon is missing");
      const iconBounds = icon.getBoundingClientRect();
      return iconBounds.left + iconBounds.width / 2;
    });
    expect(Math.max(...iconCenters) - Math.min(...iconCenters)).toBeLessThan(0.5);
    if (!collapsed) {
      const labelEdges = rows.map((row) => {
        const label = row.querySelector<HTMLElement>(".truncate");
        if (!label) throw new Error("Navigation label is missing");
        return label.getBoundingClientRect().left;
      });
      expect(Math.max(...labelEdges) - Math.min(...labelEdges)).toBeLessThan(0.5);
    }
    await page.screenshot({
      path: `../.tmp/ui-comparison/module-navigation-after-${width}-${theme}.png`,
    });
  },
);
