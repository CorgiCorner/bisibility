import { composeStories } from "@storybook/react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps, ComponentType } from "react";
import { createPortal } from "react-dom";
import { expect, it } from "vitest";
import type { OssAdminComposition } from "./OssAdminComposition";
import * as stories from "./OssComposition.stories";
import {
  assertOssBoundary,
  assertOssContent,
  assertOssSections,
  closeBoundaryDialog as closeDialog,
  scanRecoveryPortals,
} from "./oss-boundary.test-fixture";

type Args = ComponentProps<typeof OssAdminComposition>;
const composed = composeStories(
  stories as unknown as Parameters<typeof composeStories>[0],
) as unknown as Record<string, ComponentType<Partial<Args>> & { args: Args }>;

async function scanPopovers(view: string) {
  const labels = screen
    .queryAllByRole("button")
    .filter(
      (element) =>
        ["listbox", "menu"].includes(element.getAttribute("aria-haspopup") ?? "") &&
        !element.hasAttribute("disabled"),
    )
    .map((element) => element.getAttribute("aria-label") ?? element.textContent ?? "");
  for (const label of labels) {
    fireEvent.click(screen.getByRole("button", { name: label }));
    const menu = await screen.findByRole("menu");
    assertOssBoundary(view);
    fireEvent.keyDown(menu, { key: "Escape" });
    await waitFor(() => expect(menu).not.toBeInTheDocument());
  }
}

async function scanAccountActions(view: string, root: HTMLElement) {
  for (const button of within(root).queryAllByRole("button", {
    name: /^(Deactivate account|Reactivate account|Reset rate limits)$/,
  })) {
    if (button.hasAttribute("disabled")) continue;
    fireEvent.click(button);
    assertOssBoundary(view);
    await closeDialog();
  }
}

it.each(Object.entries(composed))(
  "scans the whole body and available portals in %s",
  async (name, Story) => {
    render(<Story />);
    const view = Story.args.initialView ?? "Status";
    assertOssBoundary(view);
    await scanPopovers(view);
    if (view === "Accounts") {
      await scanAccountActions(view, document.body);
      const administration = Story.args.data.administration;
      // These custom renders replace the inherited list with lookup-only fixtures.
      const lookupOnly = ["AccountLookupForbidden", "AccountLookupParity"].includes(name);
      const expectedDrawers =
        !lookupOnly &&
        administration?.isAdmin !== false &&
        !administration?.busy &&
        Story.args.loading !== "administration" &&
        (!administration?.accountsState || administration.accountsState === "ready")
          ? Math.min(administration?.accounts?.length ?? 0, 10)
          : 0;
      let visitedDrawers = 0;
      const table = screen.queryByRole("table", { name: "Accounts" });
      const emails = table
        ? within(table)
            .queryAllByRole("button")
            .filter((item) => item.textContent?.includes("@") && !item.hasAttribute("disabled"))
            .map((item) => item.textContent ?? "")
        : [];
      expect(emails).toHaveLength(expectedDrawers);
      for (const email of emails) {
        fireEvent.click(screen.getByRole("button", { name: email }));
        const drawer = await screen.findByRole("dialog", { name: "Account details" });
        assertOssBoundary(view);
        visitedDrawers++;
        await scanAccountActions(view, drawer);
        await closeDialog();
      }
      expect(visitedDrawers).toBe(expectedDrawers);
    }
    if (view === "Tasks") {
      await scanRecoveryPortals(Story.args.data.recovery, () => scanPopovers(view));
    }
  },
  180000,
);

it("rejects an unknown section planted inside a body portal even with innocent copy", () => {
  render(<composed.UsersAccounts />);
  render(createPortal(<section data-testid="cloud-revenue">Extra detail</section>, document.body));
  expect(() => assertOssSections(document.body, "Accounts")).toThrow(/Unknown section/);
});

it.each(["Revenue", "Credits", "Campaigns", "Provider usage reference", "Hosted infrastructure"])(
  "rejects forbidden portal copy: %s, even inside an allowed section",
  (copy) => {
    render(<composed.UsersAccounts />);
    render(createPortal(<section data-testid="oss-account-lookup">{copy}</section>, document.body));
    assertOssSections(document.body, "Accounts");
    expect(() => assertOssContent(document.body)).toThrow();
  },
);

it.each(["disabled", "unresponsive"] as const)(
  "fails the recovery sweep when a case dialog control is %s",
  async (state) => {
    const Story = composed.RecoveryDetail;
    const recovery = Story.args.data.recovery;
    if (!recovery) throw new Error("Expected a recovery fixture");
    render(<Story data={{ ...Story.args.data, recovery: { ...recovery, initialDetail: null } }} />);
    const table = screen.getByRole("table", { name: "Task recovery" });
    const button = within(table).getAllByRole("button", { name: "Details" })[0];
    if (state === "disabled") button.setAttribute("disabled", "");
    else button.addEventListener("click", (event) => event.stopPropagation());
    await expect(
      scanRecoveryPortals({ ...recovery, initialDetail: null }, () => scanPopovers("Tasks")),
    ).rejects.toThrow(state === "disabled" ? /enabled/ : /dialog/);
  },
);
