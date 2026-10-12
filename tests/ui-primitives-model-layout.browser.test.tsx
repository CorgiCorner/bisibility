/// <reference types="vite/client" />
import "@/app/globals.css";
import "@/.storybook/preview-fonts.css";
import AgentReportLoading from "@/app/(regional)/app/(workspace)/[project]/agent-reports/[reportId]/loading";
import { AgentReportHistory } from "@/components/agent-reports/AgentReportHistory";
import {
  AgentReportsLayout,
  AgentReportsLoading,
} from "@/components/agent-reports/AgentReportsLayout";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { ProjectContextLoading } from "@/components/project-context/ProjectContextLayout";
import { PageContent } from "@/components/shell/PageContent";
import { ShellSkeleton } from "@/components/shell/ShellSkeleton";
import { Card } from "@/components/ui/Card";
import { MenuSelect } from "@/components/ui/MenuSelect";
import messages from "@/messages/core/en/agent-workspace.json";
import shared from "@/messages/core/en/shared.json";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";

afterEach(async () => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
  await cdp().send("Emulation.setEmulatedMedia", { features: [] });
});

const sizes = [
  [2048, 900],
  [834, 900],
  [390, 844],
] as const;
const themes = ["light", "dark"] as const;
function Provider({ children }: { children: React.ReactNode }) {
  return (
    <FeatureMessagesProvider locale="en" timeZone="UTC" messages={{ ...shared, ...messages }}>
      {children}
    </FeatureMessagesProvider>
  );
}
async function setup(width: number, height: number, theme: string) {
  await page.viewport(width, height);
  document.documentElement.dataset.theme = theme;
  document.body.style.minHeight = `${height}px`;
  document.body.style.fontFamily = "var(--font-sans), sans-serif";
  await cdp().send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
}

it.each(sizes.flatMap(([width, height]) => themes.map((theme) => ({ width, height, theme }))))(
  "stacks disabled tooltip rows within an anchored popup at $width/$theme",
  async ({ width, height, theme }) => {
    await setup(width, height, theme);
    const changed = vi.fn();
    render(
      <Provider>
        <div className="w-full p-4 sm:p-5 lg:p-7">
          <div className="w-full max-w-[400px]">
            <MenuSelect
              ariaLabel="First model"
              size="input"
              matchTriggerWidth
              searchable
              value="mini"
              onChange={changed}
              options={[
                { value: "mini", label: "Mini" },
                ...Array.from({ length: 24 }, (_, i) => ({
                  value: `model-${i}`,
                  label: `Unavailable model ${i}`,
                  disabled: true,
                  tooltip: "Choose a supported payment mode first.",
                })),
                { value: "nano", label: "Nano" },
              ]}
            />
          </div>
        </div>
      </Provider>,
    );
    const trigger = screen.getByRole("button", { name: "First model" });
    await userEvent.click(trigger);
    const menu = screen.getByRole("menu");
    const rows = [...menu.querySelectorAll<HTMLElement>("[data-menu-item]")].map((row) =>
      row.getBoundingClientRect(),
    );
    await page.screenshot({ path: `../.tmp/ui-comparison/model-${width}-${theme}.png` });
    expect(rows).toHaveLength(26);
    rows.slice(1).forEach((row, i) => {
      expect(row.top).toBeGreaterThanOrEqual(rows[i].bottom - 0.5);
      expect(Math.abs(row.left - rows[0].left)).toBeLessThan(1);
      expect(Math.abs(row.width - rows[0].width)).toBeLessThan(1);
    });
    const popup = menu.getBoundingClientRect();
    const anchor = trigger.getBoundingClientRect();
    expect(Math.abs(popup.width - anchor.width)).toBeLessThan(1);
    expect(Math.abs(popup.left - anchor.left)).toBeLessThan(1);
    expect(popup.right).toBeLessThanOrEqual(width - 16);
    expect(popup.height).toBeLessThanOrEqual(360);
    expect(menu.scrollHeight).toBeGreaterThan(menu.clientHeight);
    await userEvent.fill(screen.getByRole("textbox", { name: "Search..." }), "missing model");
    expect(screen.getByText("No results")).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(document.activeElement).toBe(trigger);
    expect(changed).not.toHaveBeenCalled();
  },
);

const report = {
  id: "agr_abcdefghijklmnopqrstuvwx",
  kind: "manual_analysis" as const,
  title: "Content opportunities",
  createdAt: "2026-10-02T12:00:00.000Z",
};
it.each(sizes.flatMap(([width, height]) => themes.map((theme) => ({ width, height, theme }))))(
  "aligns reports, detail and form loaders with shell and older forms at $width/$theme",
  async ({ width, height, theme }) => {
    await setup(width, height, theme);
    const view = render(
      <Provider>
        <ShellSkeleton collapsed>
          <PageContent variant="form" data-edge="reference">
            <Card>Older settings form</Card>
          </PageContent>
          <AgentReportsLayout>
            <p>All reports</p>
            <AgentReportHistory
              reports={[report]}
              projectRef="prj_abcdefghijklmnopqrstuvwx"
              locale="en"
              timeZone="UTC"
            />
          </AgentReportsLayout>
          <AgentReportsLayout>
            <Card>No saved analyses yet</Card>
          </AgentReportsLayout>
          <AgentReportsLayout>
            <Card role="alert">Reports could not be loaded</Card>
          </AgentReportsLayout>
          <AgentReportsLoading description="All reports" addReportLabel="Save an analysis" />
          <AgentReportLoading />
          <PageContent variant="form">
            <ProjectContextLoading />
          </PageContent>
        </ShellSkeleton>
      </Provider>,
    );
    const header = view.container.querySelector(
      '[data-testid="shell-skeleton-header"]',
    ) as HTMLElement;
    const reference = view.container.querySelector('[data-edge="reference"]') as HTMLElement;
    const headerLeft =
      header.getBoundingClientRect().left + Number.parseFloat(getComputedStyle(header).paddingLeft);
    const parent = reference.parentElement;
    if (!parent) throw new Error("Shell content is missing");
    const content = [...parent.children] as HTMLElement[];
    const shell = view.container.firstElementChild;
    if (!shell) throw new Error("Shell is missing");
    await page.screenshot({
      element: shell,
      path: `../.tmp/ui-comparison/reports-${width}-${theme}.png`,
    });
    content.forEach((node) => {
      expect(Math.abs(node.getBoundingClientRect().left - headerLeft)).toBeLessThan(1);
    });
    const reports = content.slice(1, 6);
    reports.forEach((node) => {
      expect(
        Math.abs(node.getBoundingClientRect().width - reports[0].getBoundingClientRect().width),
      ).toBeLessThan(1);
    });
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
  },
);

it("lets keyboard users inspect disabled help without selecting the model", async () => {
  await setup(834, 900, "light");
  const changed = vi.fn();
  render(
    <Provider>
      <MenuSelect
        ariaLabel="Models"
        searchable
        value="mini"
        onChange={changed}
        options={[
          { value: "mini", label: "Mini" },
          {
            value: "blocked",
            label: "Blocked",
            disabled: true,
            tooltip: "Connect your own provider account.",
          },
          { value: "nano", label: "Nano" },
        ]}
      />
    </Provider>,
  );
  const trigger = screen.getByRole("button", { name: "Models" });
  await userEvent.click(trigger);
  await userEvent.keyboard("{ArrowDown}{ArrowDown}");
  const blocked = screen.getByRole("menuitem", { name: "Blocked" });
  expect(document.activeElement).toBe(blocked);
  expect(blocked).toHaveAttribute("aria-disabled", "true");
  expect(blocked).toHaveAccessibleDescription("Connect your own provider account.");
  await waitFor(() => expect(screen.getAllByRole("tooltip").length).toBeGreaterThan(0));
  await userEvent.keyboard("{Enter} ");
  expect(changed).not.toHaveBeenCalled();
  expect(screen.getByRole("menu")).toBeVisible();
  await userEvent.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  expect(document.activeElement).toBe(trigger);
  await userEvent.click(trigger);
  await userEvent.fill(screen.getByRole("textbox", { name: "Search..." }), "Blocked");
  await userEvent.keyboard("{ArrowDown}");
  const searchedBlocked = screen.getByRole("menuitem", { name: "Blocked" });
  expect(document.activeElement).toBe(searchedBlocked);
  expect(searchedBlocked).toHaveAccessibleDescription("Connect your own provider account.");
  await userEvent.keyboard("{Enter}{Escape}");
  expect(changed).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(trigger);
});
