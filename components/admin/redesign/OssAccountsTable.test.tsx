import { renderWithInstanceAdminMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { OssAccountsTable } from "./OssAccountsTable";

const accounts = Array.from({ length: 27 }, (_, index) => ({
  id: `public-${index + 1}`,
  email: `user${String(index + 1).padStart(2, "0")}@example.com`,
  status: index === 26 ? ("deactivated" as const) : ("active" as const),
  created: "2026-10-01",
  lastActive: "2026-11-01",
  projects: index + 1,
  keywords: 0,
  connections: "None",
}));

it("paginates the shared list, searches public IDs and preserves the total count", () => {
  const lookup = vi.fn();
  render(<OssAccountsTable accounts={accounts} onLookup={lookup} />);
  expect(screen.getByRole("heading", { name: "Accounts (27)" })).toBeInTheDocument();
  expect(screen.queryByText("user27@example.com")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  expect(screen.getByText("user27@example.com")).toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: "Search accounts" }), {
    target: { value: "public-1" },
  });
  expect(screen.getByText("user01@example.com")).toBeInTheDocument();
  expect(screen.queryByText("user27@example.com")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Accounts (27)" })).toBeInTheDocument();
  const table = screen.getByRole("table", { name: "Accounts" });
  const row = within(table).getByText("user01@example.com").closest('[role="row"]');
  expect(row).not.toBeNull();
  fireEvent.click(row as HTMLElement);
  expect(lookup).toHaveBeenLastCalledWith("public-1");
});

it("sorts numeric projects before paging and searches email case insensitively", () => {
  render(<OssAccountsTable accounts={accounts} onLookup={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Sort Projects ascending" }));
  fireEvent.click(screen.getByRole("button", { name: "Sort Projects descending" }));
  expect(
    within(screen.getByRole("table", { name: "Accounts" })).getAllByRole("row")[1],
  ).toHaveTextContent("user27@example.com");
  fireEvent.change(screen.getByRole("textbox", { name: "Search accounts" }), {
    target: { value: "USER27@EXAMPLE.COM" },
  });
  expect(screen.getByText("deactivated")).toBeInTheDocument();
});
