import "./real-page-mocks.test-fixture";
import {
  assertOssBoundary,
  closeBoundaryDialog,
  scanRecoveryPortals,
} from "@/components/admin/redesign/oss-boundary.test-fixture";
import { ossAdminRoutes } from "@/lib/instance-admin/routes";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { realPage } from "./real-page-mocks.test-fixture";
import { renderRealPage } from "./real-page-render.test-fixture";
import { prepareRealScenario } from "./real-page-scenario.test-fixture";

it.each(ossAdminRoutes)(
  "scans the real $href, including every available drawer and dialog",
  async ({ view }) => {
    const { data } = prepareRealScenario(view === "Tasks" ? "RecoveryParity" : "OverviewParity");
    if (view === "Accounts") prepareRealScenario("ManyAccounts");
    const result = await renderRealPage(view);
    for (const heading of result.getAllByRole("heading", { level: 2 }))
      expect(heading).not.toBeEmptyDOMElement();
    assertOssBoundary(view);
    await scanMenus(view);
    if (view === "Tasks")
      await scanRecoveryPortals(data.recovery ?? null, async () => scanMenus(view));
    if (view === "Accounts") {
      const emails = screen.getAllByRole("button").filter((b) => b.textContent?.includes("@"));
      expect(emails.length).toBeGreaterThan(0);
      for (const email of emails) {
        fireEvent.click(screen.getByRole("button", { name: email.textContent ?? "" }));
        const drawer = await screen.findByRole("dialog", { name: "Account details" });
        await waitFor(() =>
          expect(within(drawer).getByRole("button", { name: "Deactivate account" })).toBeEnabled(),
        );
        assertOssBoundary(view);
        for (const name of ["Deactivate account", "Reset rate limits"]) {
          fireEvent.click(within(drawer).getByRole("button", { name }));
          assertOssBoundary(view);
          await closeBoundaryDialog();
        }
        await closeBoundaryDialog();
      }
    }
    expect(realPage.access).toHaveBeenCalled();
  },
  // Tasks and account cases walk every menu, drawer and confirmation dialog.
  15_000,
);

async function scanMenus(view: string) {
  const names = screen
    .queryAllByRole("button")
    .filter((b) => b.getAttribute("aria-haspopup") === "menu" && !b.hasAttribute("disabled"))
    .map((b) => b.getAttribute("aria-label") ?? b.textContent ?? "");
  for (const name of names) {
    fireEvent.click(screen.getByRole("button", { name }));
    const menu = await screen.findByRole("menu");
    assertOssBoundary(view);
    fireEvent.keyDown(menu, { key: "Escape" });
    await waitFor(() => expect(menu).not.toBeInTheDocument());
  }
}
