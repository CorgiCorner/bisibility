import type { Entry } from "@/components/admin/redesign/oss-capability-types";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect } from "vitest";

const settle = () => new Promise((resolve) => setTimeout(resolve, 15));
export async function runRealStep(step: string, entry: Entry) {
  const proof = entry.proof;
  if (step === "polish") {
    expect(screen.getByRole("link", { name: "Operacje" })).toHaveAttribute(
      "href",
      "/app/admin/operations/worker",
    );
    expect(screen.getByRole("button", { name: "Odśwież dane" })).toBeEnabled();
    return true;
  }
  if (step === "recovery-selection-limit") {
    const table = () => screen.getByRole("table", { name: "Task recovery" });
    expect(within(table()).getAllByRole("checkbox")).toHaveLength(26);
    for (let index = 0; index < 25; index++) {
      const name = `Select project-limit-${index}, example-provider`;
      await waitFor(() => expect(within(table()).getByRole("checkbox", { name })).toBeEnabled());
      fireEvent.click(within(table()).getByRole("checkbox", { name }));
      await waitFor(() => expect(within(table()).getByRole("checkbox", { name })).toBeChecked());
    }
    expect(
      within(table()).getByRole("checkbox", { name: "Select project-limit-25, example-provider" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Review selected (25)" })).toBeEnabled();
    return true;
  }
  const tables: Record<string, string> = {
    sort: "Recorded schedule counters",
    "ops-sort": "Recent operational events",
    "recovery-sort": "Task recovery",
    "evidence-sort": "Partial and unresolved evidence",
    "audit-column-sort": "Instance administrator activity",
    "audit-sort": "Instance administrator activity",
  };
  if (tables[step]) {
    const name = tables[step];
    const table = () => screen.getByRole("table", { name });
    const label = proof.name ?? (step === "audit-sort" ? "Time" : "");
    const button = within(table()).getByRole("button", {
      name: (n) =>
        n === `Sort ${label} ascending` ||
        n === `Sort ${label} descending` ||
        n === `Clear ${label} sorting`,
    });
    const before = button.closest('[role="columnheader"]')?.getAttribute("aria-sort");
    fireEvent.click(button);
    await waitFor(() =>
      expect(
        within(table())
          .getByRole("button", {
            name: (n) =>
              n === `Sort ${label} ascending` ||
              n === `Sort ${label} descending` ||
              n === `Clear ${label} sorting`,
          })
          .closest('[role="columnheader"]')
          ?.getAttribute("aria-sort"),
      ).not.toBe(before),
    );
    return true;
  }
  if (step === "audit-filter") {
    fireEvent.click(screen.getByRole("button", { name: proof.name }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: proof.name })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    return true;
  }
  if (step === "recovery-filter" || step === "recovery-grouping") {
    const labels =
      step === "recovery-grouping"
        ? ["By project", "By cause", "By action"]
        : [proof.name === "Category" ? "unfinished" : "dataforseo"];
    for (const option of labels) {
      const label = step === "recovery-grouping" ? "Group this page" : proof.name;
      fireEvent.click(screen.getByRole("button", { name: label }));
      fireEvent.click(screen.getByRole("menuitem", { name: option }));
      await waitFor(() =>
        expect(screen.getByRole("button", { name: label })).toHaveTextContent(option),
      );
      if (step === "recovery-grouping")
        expect(
          within(screen.getByRole("table", { name: "Task recovery" })).getAllByText(/\(\d+\)$/)
            .length,
        ).toBeGreaterThan(0);
    }
    return true;
  }
  if (step.startsWith("accounts-")) {
    const table = () => screen.getByRole("table", { name: "Accounts" });
    const search = async (value: string) => {
      fireEvent.change(screen.getByRole("textbox", { name: "Search accounts" }), {
        target: { value },
      });
      fireEvent.click(screen.getByRole("button", { name: "Search accounts" }));
      await settle();
    };
    if (
      step === "accounts-email-search" ||
      step === "accounts-id-search" ||
      step === "accounts-open"
    ) {
      await search(step === "accounts-email-search" ? "USER27@EXAMPLE.COM" : "public-27");
      await waitFor(() => expect(within(table()).getAllByRole("row")).toHaveLength(2));
      if (step === "accounts-open") {
        fireEvent.click(within(table()).getAllByRole("row")[1]);
        await waitFor(() =>
          expect(screen.getByRole("dialog", { name: "Account details" })).toHaveTextContent(
            "user27@example.com",
          ),
        );
      }
    } else if (step === "accounts-sort") {
      const column = proof.name ?? "Email";
      const first = () => within(table()).getAllByRole("row")[1];
      const ascending = within(table()).queryByRole("button", { name: `Sort ${column} ascending` });
      if (ascending) fireEvent.click(ascending);
      await waitFor(() =>
        expect(first()).toHaveTextContent(
          column === "Last active" ? "user27@example.com" : "user01@example.com",
        ),
      );
      fireEvent.click(within(table()).getByRole("button", { name: `Sort ${column} descending` }));
      await waitFor(() =>
        expect(first()).toHaveTextContent(
          column === "Last active" ? "user01@example.com" : "user27@example.com",
        ),
      );
    } else if (step === "accounts-paging") {
      await waitFor(() => expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled());
      fireEvent.click(screen.getByRole("button", { name: "Next page" }));
      await screen.findByText("user11@example.com");
      await waitFor(() => expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled());
      fireEvent.click(screen.getByRole("button", { name: "Next page" }));
      await screen.findByText("user27@example.com");
      expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
      await screen.findByText("user11@example.com");
      await search("public-1");
      await screen.findByText("user01@example.com");
      expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    } else return false;
    return true;
  }
  return false;
}
