import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { composeStories } from "@storybook/react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentType } from "react";
import { expect, it } from "vitest";
import * as stories from "./OssComposition.stories";
import { ossNavigation } from "./PreviewShell";

const allowed = {
  Overview: ["Status"],
  Operations: ["Worker", "Checks", "Data sources", "Tasks", "Notifications"],
  Users: ["Accounts"],
  Email: ["Sending today", "Settings"],
  Audit: ["Audit"],
};
const pages = [
  "Overview",
  "OperationsWorker",
  "OperationsChecks",
  "OperationsDataSources",
  "OperationsTasks",
  "OperationsNotifications",
  "UsersAccounts",
  "EmailSendingToday",
  "EmailSettings",
  "Audit",
] as const;
const sections: Record<(typeof pages)[number], string[]> = {
  Overview: ["Status"],
  OperationsWorker: ["admin-worker", "admin-temporal"],
  OperationsChecks: ["admin-rank-checks", "admin-url-presence"],
  OperationsDataSources: ["admin-data-sources"],
  OperationsTasks: ["Recovery console", "Partial and unresolved evidence"],
  OperationsNotifications: ["admin-ops-events"],
  UsersAccounts: ["Accounts (1)", "oss-account-heading"],
  EmailSendingToday: ["admin-email-allowance"],
  EmailSettings: ["oss-mail-heading", "admin-mail-settings-heading"],
  Audit: ["Audit activity"],
};
const composed = composeStories(
  stories as unknown as Parameters<typeof composeStories>[0],
) as unknown as Record<string, ComponentType>;
it("pins the complete OSS page allowlist", () => expect(ossNavigation).toEqual(allowed));
it.each(pages)("keeps removed categories out of the %s composition story", (name) => {
  const Story = composed[name];
  const { container } = render(<Story />);
  expect(
    [...container.querySelectorAll("main section")].map(
      (element) =>
        element.getAttribute("aria-label") ??
        element.getAttribute("aria-labelledby") ??
        element.querySelector("h3")?.textContent ??
        "<unlabelled>",
    ),
  ).toEqual(sections[name]);
  for (const label of [
    "Usage & costs",
    "Growth",
    "Top consumption",
    "Recovery accounting",
    "Instance stats",
    "Provider credits",
    "New announcement",
    "AI engine",
    "Spend this month",
    "Provider usage reference",
  ])
    expect(container).not.toHaveTextContent(label);
});
it("keeps every OSS composition dependency in the public tree", () => {
  const root = process.cwd();
  const seen = new Set<string>();
  function visit(file: string) {
    if (seen.has(file)) return;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/(?:from|import)\s*["']([^"']+)["']/g)) {
      const specifier = match[1];
      expect(specifier).not.toMatch(/components\/private|private-adapters/);
      if (!specifier.startsWith("@/components/") && !specifier.startsWith(".")) continue;
      const base = specifier.startsWith("@/")
        ? path.join(root, specifier.slice(2))
        : path.resolve(path.dirname(file), specifier);
      const resolved = [`${base}.tsx`, `${base}.ts`].find(existsSync);
      if (resolved) visit(resolved);
    }
  }
  visit(path.join(root, "components/admin/redesign/OssAdminComposition.tsx"));
});

it("opens a listed account in the guarded details drawer", () => {
  const Story = composed.UsersAccounts;
  render(<Story />);
  const table = screen.getByRole("table", { name: "Accounts" });
  fireEvent.click(within(table).getByRole("button", { name: "sample@example.com" }));
  const drawer = screen.getByRole("dialog", { name: "Account details" });
  expect(within(drawer).getByRole("button", { name: "Deactivate account" })).toBeInTheDocument();
  expect(drawer).not.toHaveTextContent("Spend this month");
});
