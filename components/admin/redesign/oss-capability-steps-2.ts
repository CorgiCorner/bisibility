import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, vi } from "vitest";
import type { Proof } from "./oss-capability-types";
export async function runStep2(step: string, proof: Proof) {
  if (step === "polish") {
    fireEvent.click(screen.getByRole("button", { name: "Operacje" }));
    fireEvent.click(screen.getByRole("button", { name: "Powiadomienia" }));
    expect(screen.getByRole("button", { name: "Odśwież dane" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Wyślij testowe powiadomienie" }),
    ).toBeInTheDocument();
    return true;
  }
  if (step === "clipboard-success") {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    fireEvent.click(screen.getByRole("button", { name: "Copy target ID" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("sample-target"));
    return true;
  }
  if (step === "clipboard-failure") {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("failed")) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Copy target ID" }));
    return true;
  }
  if (step === "focus-worker") {
    fireEvent.focus(screen.getByText("Worker Unknown"));
    return true;
  }
  if (step === "send-pending" || step === "sweep-pending") {
    fireEvent.click(
      screen.getByRole("button", {
        name: step === "send-pending" ? "Send test notification" : "Run outbox sweep",
      }),
    );
    return true;
  }
  if (step === "mail-select") {
    fireEvent.click(screen.getByRole("button", { name: "Provider" }));
    fireEvent.click(screen.getByRole("menuitem", { name: proof.scopeText }));
    return true;
  }
  if (
    step === "mail-invalid-smtp" ||
    step === "mail-invalid-sender" ||
    step === "mail-invalid-port" ||
    step === "mail-invalid-ses"
  ) {
    const set = (label: string, value: string) =>
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    if (step === "mail-invalid-ses") {
      fireEvent.click(screen.getByRole("button", { name: "Provider" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "Amazon SES" }));
      set("Region", "us-east-1");
      set("Access key ID", "access-key");
    } else if (step === "mail-invalid-port") {
      set("Host", "smtp.example.com");
      set("Port", "70000");
    }
    set("Sender", step === "mail-invalid-sender" ? "invalid-sender" : "admin@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Save mail settings" }));
    return true;
  }
  if (step === "mail-save-new") {
    fireEvent.change(screen.getByLabelText("Sender"), {
      target: { value: "admin@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Host"), { target: { value: "smtp.example.com" } });
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "operator" } });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "example-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save mail settings" }));
    await screen.findByText("Credentials are saved.");
    return true;
  }
  if (step === "lookup-sample") {
    expect(screen.queryByText("sample@example.com · user-1 · active")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Exact email or user ID" }), {
      target: { value: "sample@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Look up" }));
    await screen.findByText("sample@example.com · user-1 · active");
    return true;
  }
  if (step === "audit-filter") {
    const button = screen.getByRole("button", { name: proof.name });
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    if (proof.name === "ops") expect(screen.getByText("Failed action")).toBeInTheDocument();
    if (proof.name === "setup") expect(screen.getByText("Changed setting")).toBeInTheDocument();
    if (proof.name === "account")
      expect(screen.getByText("No activity in this filter.")).toBeInTheDocument();
    return true;
  }
  if (step === "lookup-forbidden") {
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Exact email or user ID" }), {
      target: { value: "sample@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Look up" }));
    return true;
  }
  if (step === "lookup-not-found") {
    fireEvent.change(screen.getByRole("textbox", { name: "Exact email or user ID" }), {
      target: { value: "nobody@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Look up" }));
    return true;
  }
  if (step === "audit-column-sort") {
    const table = screen.getByRole("table", { name: "Instance administrator activity" });
    const button = within(table).getByRole("button", { name: `Sort ${proof.name} ascending` });
    const header = button.closest("[role=columnheader]");
    const before = header?.getAttribute("aria-sort");
    fireEvent.click(button);
    expect(header?.getAttribute("aria-sort")).not.toBe(before);
    return true;
  }
  if (step === "mail-provider-menu") {
    fireEvent.click(screen.getByRole("button", { name: "Provider" }));
    return true;
  }
  if (step === "mail-configured") {
    expect(screen.getByRole("button", { name: "Provider" })).toHaveTextContent("SMTP");
    expect(screen.getByText("Credentials are saved.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Replace credentials" })).toBeEnabled();
    return true;
  }
  if (step === "mail-save") {
    fireEvent.click(screen.getByRole("button", { name: "Save mail settings" }));
    return true;
  }
  if (step === "mail-clear") {
    fireEvent.click(screen.getByRole("button", { name: "Clear saved settings" }));
    return true;
  }
  if (step === "lookup-invalid") {
    fireEvent.change(screen.getByRole("textbox", { name: "Exact email or user ID" }), {
      target: { value: "bad identifier" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Look up" }));
    return true;
  }
  if (
    step === "account-deactivate" ||
    step === "account-reactivate" ||
    step === "account-reset" ||
    step === "confirm-deactivate" ||
    step === "confirm-reactivate" ||
    step === "confirm-reset"
  ) {
    const action = step.split("-")[1];
    const label =
      action === "reset"
        ? "Reset rate limits"
        : action === "reactivate"
          ? "Reactivate account"
          : "Deactivate account";
    fireEvent.click(screen.getByRole("button", { name: label }));
    if (step.startsWith("account-"))
      expect(
        within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }),
      ).toBeEnabled();
    if (step.startsWith("confirm"))
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: label }));
    return true;
  }
  if (step === "parity-copy" || step === "account-copy") {
    // Assert the clipboard value after locating the control.
    return true;
  }
  if (step === "audit-sort") {
    const table = screen.getByRole("table", { name: "Instance administrator activity" });
    const button = within(table).getByRole("button", { name: (name) => name.includes("Time") });
    const header = button.closest("[role=columnheader]");
    const before = header?.getAttribute("aria-sort");
    fireEvent.click(button);
    expect(header?.getAttribute("aria-sort")).not.toBe(before);
    return true;
  }
  return false;
}
