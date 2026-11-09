import { renderWithFeatureMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import instance from "@/messages/core/pl/instance-admin.json";
import shared from "@/messages/core/pl/shared.json";
import { fireEvent, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { OssAccountsTable } from "./OssAccountsTable";
import { OssAdministration } from "./OssAdministration";

const messages = { ...shared, ...instance };
const labels = instance.instanceAdmin.accounts;
const account = {
  id: "public-1",
  email: "test@example.com",
  status: "active" as const,
  created: "2026-11-01",
  lastActive: "2026-11-02",
  projects: 2,
  keywords: 3,
  connections: "1",
};
const english =
  /\b(?:Accounts|Search accounts|Not reported|Find an account|Account details|Copy ID|active|deactivated|Created|Last active|Projects|Keywords|Connections)\b/;

it("translates headings, controls, statuses and the portal drawer using a real non-English catalog", () => {
  render(
    <OssAdministration
      account={null}
      accounts={[account]}
      section="accounts"
      onLookup={vi.fn()}
      onAccountAction={vi.fn()}
      onSaveMail={vi.fn()}
      onClearMail={vi.fn()}
    />,
    { locale: "pl", messages },
  );
  expect(screen.getByRole("heading", { name: "Konta (1)" })).toBeInTheDocument();
  const input = screen.getByRole("textbox", { name: labels.searchLabel });
  expect(input).toHaveAttribute("placeholder", labels.searchPlaceholder);
  expect(screen.getByText(labels.statuses.active)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: account.email }));
  const drawer = screen.getByRole("dialog", { name: labels.details });
  for (const key of ["created", "lastActive", "projects", "keywords", "connections"] as const)
    expect(within(drawer).getByText(labels[key])).toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(english);
});

it.each(["loading", "unavailable", "ready"] as const)("translates the %s list state", (state) => {
  render(<OssAccountsTable accounts={[]} state={state} />, { locale: "pl", messages });
  expect(document.body.textContent).not.toMatch(english);
  expect(screen.getByText(state === "ready" ? labels.empty : labels[state])).toBeInTheDocument();
});
