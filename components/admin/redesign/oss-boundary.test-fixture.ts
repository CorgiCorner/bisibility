import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { expect } from "vitest";
import type { OssRecovery } from "./OssRecovery";

export const allowedOssSections: Record<string, readonly string[]> = {
  Status: ["oss-status"],
  Worker: ["admin-worker", "admin-temporal"],
  Checks: ["admin-rank-checks", "admin-url-presence"],
  "Data sources": ["admin-data-sources"],
  Tasks: ["oss-tasks", "oss-partial-evidence"],
  Notifications: ["admin-ops-events"],
  Accounts: ["oss-accounts", "oss-account-lookup"],
  "Sending today": ["admin-email-allowance"],
  Settings: ["oss-mail-warning", "oss-mail", "oss-mail-settings"],
  Audit: ["oss-audit"],
};
// PAY, CRED, MKT, USAGE and INFRA, including portal-only copy.
export const forbiddenOssContent =
  /\$|\b(?:USD|MRR|revenue|subscriptions?|payments?|refunds?|credits?|trials?|access codes?|journey|retention|cohorts?|surveys?|signups?|growth|campaigns?|metering|budgets?|ledgers?|costs?|spend(?:ing)?|paid|charges?|prices?|AI engine|hosted|billing|infrastructure|instance stats|provider usage reference|top consumption)\b/i;

export function assertOssContent(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: string[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode.textContent ?? "");
  expect(nodes.join(" ")).not.toMatch(forbiddenOssContent);
}

export function assertOssSections(root: HTMLElement, view: string) {
  for (const section of root.querySelectorAll("section"))
    expect(
      allowedOssSections[view],
      `Unknown section: ${section.outerHTML.slice(0, 200)}`,
    ).toContain(section.getAttribute("data-testid"));
}

export function assertOssBoundary(view: string) {
  assertOssSections(document.body, view);
  assertOssContent(document.body);
}

export async function closeBoundaryDialog() {
  let top = screen.getAllByRole("dialog").at(-1);
  if (!top) throw new Error("Expected a dialog to close");
  await waitFor(() => {
    top = screen.getAllByRole("dialog").at(-1);
    if (!top) throw new Error("Expected a dialog to close");
    expect(within(top).getByRole("button", { name: /^Close (modal|drawer)$/ })).toBeEnabled();
  });
  if (!top) throw new Error("Expected a dialog to close");
  const close = within(top).getByRole("button", { name: /^Close (modal|drawer)$/ });
  fireEvent.click(close);
  await waitFor(() => expect(top).not.toBeInTheDocument());
}

export async function scanRecoveryPortals(
  recovery: ComponentProps<typeof OssRecovery> | null,
  scanPopovers: () => Promise<void>,
) {
  const rows = recovery?.isAdmin !== false ? (recovery?.page?.rows ?? []) : [];
  const expected = {
    initial: Number(!!recovery?.initialDetail) + Number(!!recovery?.initialDialogOpen),
    cases: rows.length,
    batch: Number(!recovery?.busy && rows.some((row) => row.action)),
  };
  const visited = { initial: 0, cases: 0, batch: 0 };
  expect(screen.queryAllByRole("dialog")).toHaveLength(expected.initial);
  for (let index = 0; index < expected.initial; index++) {
    assertOssBoundary("Tasks");
    visited.initial++;
    await closeBoundaryDialog();
  }
  if (!rows.length) {
    expect(screen.queryAllByRole("button", { name: "Details" })).toHaveLength(0);
    expect(visited).toEqual(expected);
    return visited;
  }
  const table = () => screen.getByRole("table", { name: "Task recovery" });
  expect(within(table()).getAllByRole("button", { name: "Details" })).toHaveLength(expected.cases);
  for (let index = 0; index < expected.cases; index++) {
    const button = within(table()).getAllByRole("button", { name: "Details" })[index];
    expect(button).toBeEnabled();
    fireEvent.click(button);
    const dialog = await screen.findByRole("dialog", { name: "Case details" });
    expect(dialog).toHaveTextContent(rows[index].project ?? "Retained scope");
    assertOssBoundary("Tasks");
    await scanPopovers();
    visited.cases++;
    await closeBoundaryDialog();
  }
  const eligible = within(table())
    .queryAllByRole("checkbox")
    .filter((checkbox) => !checkbox.hasAttribute("disabled"));
  expect(eligible).toHaveLength(recovery?.busy ? 0 : rows.filter((row) => row.action).length);
  if (expected.batch) {
    fireEvent.click(eligible[0]);
    const review = await screen.findByRole("button", { name: "Review selected (1)" });
    expect(review).toBeEnabled();
    fireEvent.click(review);
    await screen.findByRole("dialog", { name: "Preview recovery batch" });
    assertOssBoundary("Tasks");
    visited.batch++;
    await closeBoundaryDialog();
  }
  expect(visited).toEqual(expected);
  return visited;
}
