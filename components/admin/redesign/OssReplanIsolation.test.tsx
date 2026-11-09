import { composeStories } from "@storybook/react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentType } from "react";
import { expect, it } from "vitest";
import * as stories from "./OssComposition.stories";

const composed = composeStories(
  stories as unknown as Parameters<typeof composeStories>[0],
) as unknown as Record<string, ComponentType>;

import { forbiddenOssContent as money } from "./oss-boundary.test-fixture";

it.each([
  "OperationsTasks",
  "RecoveryDetail",
  "RecoveryPreview",
  "RecoveryClosedUnknown",
  "RecoveryParity",
])("%s contains no money in task facts or dialogs", (name) => {
  const Story = composed[name];
  render(<Story />);
  expect(money.test(document.body.textContent ?? "")).toBe(false);
});

it("keeps account details and rate-limit confirmation free of usage and money", () => {
  const Story = composed.UsersAccounts;
  render(<Story />);
  fireEvent.click(
    within(screen.getByRole("table", { name: "Accounts" })).getByRole("button", {
      name: "sample@example.com",
    }),
  );
  const drawer = screen.getByRole("dialog", { name: "Account details" });
  expect(money.test(drawer.textContent ?? "")).toBe(false);
  fireEvent.click(within(drawer).getByRole("button", { name: "Reset rate limits" }));
  expect(money.test(document.body.textContent ?? "")).toBe(false);
});

it("links the status badge to the single email allowance and preserves settings separately", () => {
  const Story = composed.Overview;
  const { container } = render(<Story />);
  expect(container.querySelectorAll("#admin-email-allowance")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: /Email sending today/ }));
  expect(container.querySelectorAll("#admin-email-allowance")).toHaveLength(1);
  fireEvent.click(
    within(screen.getByRole("navigation", { name: "Email views" })).getByRole("button", {
      name: "Settings",
    }),
  );
  expect(container.querySelectorAll("#admin-email-allowance")).toHaveLength(0);
  expect(screen.getByRole("region", { name: "Instance email settings" })).toBeInTheDocument();
});
