import { fireEvent, screen, within } from "@testing-library/react";
import { expect } from "vitest";
import type { Proof } from "./oss-capability-types";

export function runAccountStep(step: string, proof: Proof) {
  const table = () => screen.getByRole("table", { name: "Accounts" });
  const search = (value: string) =>
    fireEvent.change(screen.getByRole("textbox", { name: "Search accounts" }), {
      target: { value },
    });
  if (step === "accounts-email-search" || step === "accounts-id-search") {
    search(step === "accounts-id-search" ? "public-27" : "USER27@EXAMPLE.COM");
    expect(within(table()).getAllByRole("row")).toHaveLength(2);
    expect(screen.queryByText("user01@example.com")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Accounts (27)" })).toBeInTheDocument();
    return true;
  }
  if (step === "accounts-paging") {
    expect(screen.queryByText("user27@example.com")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("user11@example.com")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("user27@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(screen.getByText("user11@example.com")).toBeInTheDocument();
    search("public-1");
    expect(screen.getByText("user01@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    return true;
  }
  if (step === "accounts-sort") {
    const column = proof.name ?? "Email";
    const first = () => within(table()).getAllByRole("row")[1];
    fireEvent.click(screen.getByRole("button", { name: `Sort ${column} ascending` }));
    expect(first()).toHaveTextContent(
      column === "Last active" ? "user27@example.com" : "user01@example.com",
    );
    fireEvent.click(screen.getByRole("button", { name: `Sort ${column} descending` }));
    expect(first()).toHaveTextContent(
      column === "Last active" ? "user01@example.com" : "user27@example.com",
    );
    return true;
  }
  if (step === "accounts-open") {
    search("public-27");
    const row = within(table()).getAllByRole("row")[1];
    fireEvent.click(row);
    expect(screen.getByRole("dialog", { name: "Account details" })).toHaveTextContent(
      "user27@example.com",
    );
    return true;
  }
  return false;
}
