/// <reference types="vite/client" />
import "@/app/globals.css";
import "@/.storybook/preview-fonts.css";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { AppHeaderFrame } from "@/components/shell/AppHeaderFrame";
import { ShellSkeleton } from "@/components/shell/ShellSkeleton";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { DataTableFooter } from "@/components/ui/data-table/DataTableFooter";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { shellFeatureTestMessages } from "@/i18n/test-support/feature-test-messages";
import type { OperationSnapshot } from "@/lib/rank-check/runs/contract";
import { AppRealtimeContext } from "@/lib/realtime/useAppRealtime";
import messages from "@/messages/core/en/shared.json";
import { BellIcon } from "@phosphor-icons/react/dist/csr/Bell";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";

function luminance(css: string) {
  const channels = css
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  if (channels?.length !== 3) throw new Error(`Unsupported color: ${css}`);
  return channels.reduce((sum, channel, index) => {
    const value = channel / 255;
    return (
      sum +
      [0.2126, 0.7152, 0.0722][index] *
        (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    );
  }, 0);
}
function contrast(a: string, b: string) {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}
function checkText(element: Element, background: string) {
  expect(contrast(getComputedStyle(element).color, background)).toBeGreaterThanOrEqual(4.5);
}

afterEach(async () => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
  await cdp().send("Emulation.setEmulatedMedia", { features: [] });
});

it.each([1440, 834, 390].flatMap((width) => ["light", "dark"].map((theme) => ({ width, theme }))))(
  "keeps chrome, workspace, controls and focus readable at $width/$theme",
  async ({ width, theme }) => {
    await page.viewport(width, 900);
    document.documentElement.dataset.theme = theme;
    await cdp().send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    const disabledClick = vi.fn();
    const view = render(
      <FeatureMessagesProvider locale="en" messages={messages} timeZone="UTC">
        <div className="bg-bg text-fg">
          <ShellSkeleton>
            <Card data-testid="theme-card" className="m-4">
              <p>Search visibility</p>
              <p className="text-fg-muted">Rankings from your connected providers</p>
            </Card>
          </ShellSkeleton>
          <Card className="m-4">
            <Button>Check rankings</Button>
            <Button variant="destructive">Delete keyword</Button>
            <Button disabled onClick={disabledClick}>
              Unavailable action
            </Button>
            <Checkbox checked readOnly label="Daily checks" />
          </Card>
        </div>
      </FeatureMessagesProvider>,
    );
    const header = screen.getByTestId("shell-skeleton-header");
    const sidebar = screen.getByTestId("shell-skeleton-sidebar");
    const card = screen.getByTestId("theme-card");
    expect(header).toBeTruthy();
    const workspace = getComputedStyle(view.container.firstElementChild as Element).backgroundColor;
    const chrome = getComputedStyle(header as Element).backgroundColor;
    const surface = getComputedStyle(card).backgroundColor;
    expect(luminance(chrome)).toBeLessThan(luminance(workspace));
    expect(luminance(workspace)).toBeLessThan(luminance(surface));
    if (width >= 1024) expect(getComputedStyle(sidebar as Element).backgroundColor).toBe(chrome);
    card.querySelectorAll("p").forEach((element) => {
      checkText(element, surface);
    });
    const primary = screen.getByRole("button", { name: "Check rankings" });
    const danger = screen.getByRole("button", { name: "Delete keyword" });
    for (const button of [primary, danger]) {
      checkText(button, getComputedStyle(button).backgroundColor);
      await userEvent.hover(button);
      await waitFor(() => checkText(button, getComputedStyle(button).backgroundColor));
    }
    const disabled = screen.getByRole("button", { name: "Unavailable action" });
    expect(disabled).toBeDisabled();
    disabled.click();
    expect(disabledClick).not.toHaveBeenCalled();
    await userEvent.keyboard("{Tab}");
    primary.focus();
    await userEvent.keyboard("{Tab}{Shift>}{Tab}{/Shift}");
    await waitFor(() => expect(primary).toHaveFocus());
    const focus = getComputedStyle(primary);
    expect(focus.outlineStyle).toBe("solid");
    expect(contrast(focus.outlineColor, surface)).toBeGreaterThanOrEqual(3);
    const input = screen.getByRole("checkbox", { name: "Daily checks" });
    const tick = input.parentElement?.querySelector("svg");
    expect(tick).toBeTruthy();
    expect(
      contrast(getComputedStyle(tick as Element).color, getComputedStyle(input).backgroundColor),
    ).toBeGreaterThanOrEqual(4.5);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `../.tmp/ui-comparison/theme-controls-${width}-${theme}.png` });
  },
);

it.each(["light", "dark"] as const)(
  "distinguishes enabled, hover, focus and disabled button hierarchy in %s",
  async (theme) => {
    await page.viewport(1200, 1000);
    document.documentElement.dataset.theme = theme;
    await cdp().send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    const disabledClick = vi.fn();
    const pagination = vi.fn();
    const variants = ["primary", "secondary", "outline", "ghost"] as const;
    render(
      <FeatureMessagesProvider locale="en" messages={messages} timeZone="UTC">
        <main className="min-h-screen bg-bg p-6 text-fg">
          <h1 className="mb-4 text-ui-heading">Neutral button hierarchy</h1>
          <Card className="grid gap-4 p-4">
            <p>
              Enabled and disabled use the same variant; disabled controls dim and remain inert.
            </p>
            {variants.map((variant) => (
              <div key={variant} className="flex items-center gap-4">
                <span className="w-24">{variant}</span>
                <Button variant={variant}>Enabled {variant}</Button>
                <Button variant={variant} disabled onClick={disabledClick}>
                  Disabled {variant}
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-4">
              <span className="w-24">Icon action</span>
              <IconButton aria-label="Add a report">
                <PlusIcon size={15} />
              </IconButton>
              <IconButton aria-label="Unavailable icon action" disabled onClick={disabledClick}>
                <PlusIcon size={15} />
              </IconButton>
            </div>
            <form className="grid gap-3" onSubmit={(event) => event.preventDefault()}>
              <label htmlFor="button-review-name">Report name</label>
              <Input id="button-review-name" defaultValue="Weekly visibility" />
              <div className="flex gap-3">
                <Button type="submit">Save report</Button>
                <Button variant="outline">Cancel</Button>
              </div>
            </form>
            <DataTableFooter
              layout="auto"
              page={1}
              rowCount={60}
              pagination={{ page: 1, pageSize: 25, pageSizeOptions: [25, 50], rowCount: 60 }}
              onPaginationChange={pagination}
            />
          </Card>
        </main>
      </FeatureMessagesProvider>,
    );
    const main = document.querySelector("main") as HTMLElement;
    const card =
      main.querySelector("[data-slot=card]") ?? main.querySelector("form")?.parentElement;
    const surface = getComputedStyle(card as Element).backgroundColor;
    const primary = screen.getByRole("button", { name: "Enabled primary" });
    const primaryFill = getComputedStyle(primary).backgroundColor;
    if (theme === "light") expect(luminance(primaryFill)).toBeLessThan(0.02);
    else expect(luminance(primaryFill)).toBeGreaterThan(0.7);
    for (const variant of variants) {
      const enabled = screen.getByRole("button", { name: `Enabled ${variant}` });
      const disabled = screen.getByRole("button", { name: `Disabled ${variant}` });
      const paint = getComputedStyle(enabled);
      checkText(
        enabled,
        paint.backgroundColor === "rgba(0, 0, 0, 0)" ? surface : paint.backgroundColor,
      );
      expect(paint.opacity).toBe("1");
      expect(paint.cursor).toBe("pointer");
      expect(disabled).toBeDisabled();
      expect(getComputedStyle(disabled).opacity).toBe("0.5");
      disabled.click();
      expect(disabledClick).not.toHaveBeenCalled();
      const before = paint.backgroundColor;
      await userEvent.hover(enabled);
      await waitFor(() => expect(getComputedStyle(enabled).backgroundColor).not.toBe(before));
      checkText(enabled, getComputedStyle(enabled).backgroundColor);
      await userEvent.keyboard("{Tab}");
      enabled.focus();
      await userEvent.keyboard("{Tab}{Shift>}{Tab}{/Shift}");
      await waitFor(() => expect(enabled).toHaveFocus());
      expect(contrast(getComputedStyle(enabled).outlineColor, surface)).toBeGreaterThanOrEqual(3);
    }
    const previous = screen.getByRole("button", { name: "Previous page" });
    const next = screen.getByRole("button", { name: "Next page" });
    expect(previous).toBeDisabled();
    expect(getComputedStyle(previous).opacity).toBe("0.5");
    expect(next).not.toBeDisabled();
    expect(next.getBoundingClientRect().width).toBe(30);
    expect(next.getBoundingClientRect().height).toBe(30);
    await userEvent.click(next);
    expect(pagination).toHaveBeenCalledWith({ page: 2, pageSize: 25 });
    await userEvent.hover(main);
    await page.screenshot({ path: `../.tmp/ui-comparison/button-hierarchy-${theme}-enabled.png` });
    await userEvent.hover(primary);
    await page.screenshot({ path: `../.tmp/ui-comparison/button-hierarchy-${theme}-hover.png` });
    await userEvent.hover(main);
    await userEvent.keyboard("{Tab}");
    primary.focus();
    await userEvent.keyboard("{Tab}{Shift>}{Tab}{/Shift}");
    expect(primary).toHaveFocus();
    await page.screenshot({ path: `../.tmp/ui-comparison/button-hierarchy-${theme}-focus.png` });
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(1200);
  },
);

const runningHeaderOperation = {
  blockedReason: null,
  costCents: 0,
  counts: {
    cancelled: 0,
    completed: 3,
    deferred: 0,
    failed: 0,
    requested: 20,
    skipped: 0,
    total: 20,
  },
  estimatedCostCents: 0,
  finishedAt: null,
  id: "rcr_abcdefghijklmnopqrstuvwx",
  keywordCount: 10,
  kind: "rank_check",
  outcome: null,
  parentRunId: null,
  nextCheckAt: null,
  plannedFor: null,
  provider: "serpapi",
  providerLabel: "SerpApi",
  selectionKind: "filter",
  startedAt: "2026-10-10T12:00:00.000Z",
  status: "running",
  targetCount: 20,
  trigger: "manual",
} satisfies OperationSnapshot;

function headerFixture(operations: OperationSnapshot[] = []) {
  return (
    <FeatureMessagesProvider locale="en" messages={shellFeatureTestMessages} timeZone="UTC">
      <AppRealtimeContext.Provider value={{ notifications: null, operations, status: "live" }}>
        <main className="min-h-screen bg-bg text-fg">
          <AppHeaderFrame
            activeProjectId="prj_header"
            projectRef="prj_header"
            canCreateWorkspace={false}
            workspaces={[]}
            user={{ name: "Alex Kim", email: "demo@example.com", avatarUrl: null }}
            notificationControl={
              <IconButton aria-label="Notifications">
                <BellIcon size={18} />
              </IconButton>
            }
          />
          <p className="p-6">Header utilities remain quiet beside workspace actions.</p>
        </main>
      </AppRealtimeContext.Provider>
    </FeatureMessagesProvider>
  );
}

it.each([1440, 834, 390].flatMap((width) => ["light", "dark"].map((theme) => ({ width, theme }))))(
  "keeps header utilities and their menus readable at $width/$theme",
  async ({ width, theme }) => {
    await page.viewport(width, 650);
    document.documentElement.dataset.theme = theme;
    await cdp().send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    const view = render(headerFixture());
    const header = view.container.querySelector("header");
    if (!header) throw new Error("Missing real application header");
    const surface = getComputedStyle(header).backgroundColor;
    const runs = screen.getByRole("link", { name: "Runs" });
    const account = screen.getByRole("button", { name: "Account menu" });
    expect(runs).toHaveAttribute("href", "/app/prj_header/runs");
    expect(runs.getBoundingClientRect().height).toBe(22);
    expect(account.getBoundingClientRect().width).toBe(32);
    expect(account.getBoundingClientRect().height).toBe(32);
    for (const control of [runs, account]) {
      expect(getComputedStyle(control).backgroundColor).toBe("rgba(0, 0, 0, 0)");
      checkText(control, surface);
      await userEvent.hover(control);
      expect(getComputedStyle(control).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
      checkText(control, getComputedStyle(control).backgroundColor);
      await userEvent.keyboard("{Tab}");
      control.focus();
      await userEvent.keyboard("{Tab}{Shift>}{Tab}{/Shift}");
      await waitFor(() => expect(control).toHaveFocus());
      expect(getComputedStyle(control).outlineWidth).toBe("2px");
      expect(contrast(getComputedStyle(control).outlineColor, surface)).toBeGreaterThanOrEqual(3);
    }
    await userEvent.hover(header);
    account.blur();
    await page
      .elementLocator(header)
      .screenshot({ path: `../.tmp/ui-comparison/header-${width}-${theme}-idle.png` });
    if (!account.parentElement) throw new Error("Missing header utility cluster");
    await page.elementLocator(account.parentElement).screenshot({
      path: `../.tmp/ui-comparison/header-${width}-${theme}-utilities.png`,
    });
    await userEvent.click(account);
    const menu = await screen.findByRole("menu", { name: "Account menu" });
    expect(account).toHaveAttribute("aria-expanded", "true");
    checkText(menu, getComputedStyle(menu).backgroundColor);
    expect(menu.getBoundingClientRect().right).toBeLessThanOrEqual(width - 15);
    expect(menu.getBoundingClientRect().left).toBeGreaterThanOrEqual(15);
    await userEvent.keyboard("{ArrowDown}");
    expect(menu.contains(document.activeElement)).toBe(true);
    await page.screenshot({
      path: `../.tmp/ui-comparison/header-${width}-${theme}-account-menu.png`,
    });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu", { name: "Account menu" })).toBeNull());
    expect(account).toHaveFocus();
    expect(account).toHaveAttribute("aria-expanded", "false");
    view.rerender(headerFixture([runningHeaderOperation]));
    const activity = screen.getByRole("button", { name: "1 running operation, open activity" });
    await userEvent.click(activity);
    const popup = await screen.findByRole("dialog", { name: "Activity" });
    expect(activity).toHaveAttribute("aria-expanded", "true");
    checkText(popup, getComputedStyle(popup).backgroundColor);
    expect(popup.getBoundingClientRect().right).toBeLessThanOrEqual(width - 15);
    expect(popup.getBoundingClientRect().left).toBeGreaterThanOrEqual(15);
    await page.screenshot({ path: `../.tmp/ui-comparison/header-${width}-${theme}-activity.png` });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Activity" })).toBeNull());
    expect(activity).toHaveFocus();
    expect(activity).toHaveAttribute("aria-expanded", "false");
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
  },
);
