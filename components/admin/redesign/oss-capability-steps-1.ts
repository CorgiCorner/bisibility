import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect } from "vitest";
import type { Proof } from "./oss-capability-types";
export async function runStep1(step: string, proof: Proof) {
  if (step === "ops-send" || step === "ops-sweep") {
    const region = screen.getByRole("region", { name: "Ops events" });
    fireEvent.click(
      within(region).getByRole("button", {
        name: step === "ops-send" ? "Send test notification" : "Run outbox sweep",
      }),
    );
    return true;
  }
  if (step === "ops-pending") {
    const region = screen.getByRole("region", { name: "Ops events" });
    fireEvent.click(within(region).getByRole("button", { name: "Send test notification" }));
    expect(within(region).getByRole("button", { name: "Run outbox sweep" })).toBeDisabled();
    return true;
  }
  if (step === "email-help") {
    const help = screen.getByRole("button", { name: proof.text });
    fireEvent.focus(help);
    await waitFor(() => expect(document.querySelector("[data-ui-tooltip]")).not.toBeNull());
    return true;
  }
  if (step === "ops-sort") {
    const table = screen.getByRole("table", { name: "Recent operational events" });
    const button = within(table).getByRole("button", {
      name: (name) => name.includes(proof.name ?? ""),
    });
    const header = button.closest("[role=columnheader]");
    const before = header?.getAttribute("aria-sort");
    fireEvent.click(button);
    expect(header?.getAttribute("aria-sort")).not.toBe(before);
    return true;
  }
  if (step === "ops-resize" || step === "ops-reset") {
    const table = screen.getByRole("table", { name: "Recent operational events" });
    const handle = within(table).getAllByRole("separator")[0];
    fireEvent.doubleClick(handle);
    const initial = table.style.getPropertyValue("--dt-col-kind");
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(table.style.getPropertyValue("--dt-col-kind")).not.toBe(initial);
    const afterKeyboard = table.style.getPropertyValue("--dt-col-kind");
    fireEvent.mouseDown(handle, { button: 0, clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 120 });
    fireEvent.mouseUp(document, { clientX: 120 });
    expect(table.style.getPropertyValue("--dt-col-kind")).not.toBe(afterKeyboard);
    if (step === "ops-reset") {
      fireEvent.doubleClick(handle);
      expect(table.style.getPropertyValue("--dt-col-kind")).toBe(initial);
    }
    return true;
  }
  if (step === "recovery-selection-limit") {
    const table = screen.getByRole("table", { name: "Task recovery" });
    const boxes = within(table).getAllByRole("checkbox");
    expect(boxes).toHaveLength(26);
    for (let i = 0; i < 25; i++)
      fireEvent.click(
        within(table).getByRole("checkbox", {
          name: `Select project-limit-${i}, example-provider`,
        }),
      );
    expect(
      within(table).getByRole("checkbox", {
        name: "Select project-limit-24, example-provider",
      }),
    ).toBeChecked();
    expect(
      within(table).getByRole("checkbox", {
        name: "Select project-limit-25, example-provider",
      }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Review selected (25)" })).toBeEnabled();
    return true;
  }
  if (step === "recovery-grouping") {
    const control = screen.getByRole("button", { name: "Group this page" });
    for (const option of ["By project", "By cause", "By action"]) {
      fireEvent.click(control);
      fireEvent.click(screen.getByRole("menuitem", { name: option }));
      expect(control).toHaveTextContent(option);
      expect(
        within(screen.getByRole("table", { name: "Task recovery" })).getAllByText(/\(\d+\)$/)
          .length,
      ).toBeGreaterThan(0);
    }
    return true;
  }
  if (step === "recovery-category") {
    fireEvent.click(screen.getByRole("button", { name: "Category" }));
    return true;
  }
  if (step === "recovery-next") {
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    return true;
  }
  if (step === "recovery-detail-conflict" || step === "recovery-detail-pending") {
    const table = screen.getByRole("table", { name: "Task recovery" });
    const project = step.endsWith("conflict") ? "prj_example_conflict" : "prj_example_pending";
    const row = within(table)
      .getByRole("checkbox", { name: (name) => name.startsWith(`Select ${project},`) })
      .closest('[role="row"]') as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Details" }));
    expect(screen.getByRole("dialog", { name: "Case details" })).toBeVisible();
    return true;
  }
  if (step === "recovery-waiting") {
    fireEvent.click(screen.getByRole("button", { name: "Triage status" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "waiting evidence" }));
    return true;
  }
  if (step === "recovery-confirm") {
    fireEvent.click(screen.getByRole("button", { name: "Confirm recovery" }));
    return true;
  }
  if (step === "recovery-help") {
    const help = screen.getByRole("button", { name: proof.text });
    fireEvent.focus(help);
    await waitFor(() => expect(document.querySelector("[data-ui-tooltip]")).not.toBeNull());
    return true;
  }
  if (step === "recovery-sort" || step === "evidence-sort") {
    const table = screen.getByRole("table", {
      name: step === "recovery-sort" ? "Task recovery" : "Partial and unresolved evidence",
    });
    const button = within(table).getByRole("button", {
      name: (name) => name === `Sort ${proof.name} ascending`,
    });
    const header = button.closest("[role=columnheader]");
    const before = header?.getAttribute("aria-sort");
    fireEvent.click(button);
    expect(header?.getAttribute("aria-sort")).not.toBe(before);
    return true;
  }
  if (["recovery-resize", "recovery-reset", "evidence-resize", "evidence-reset"].includes(step)) {
    const recoveryTable = step.startsWith("recovery");
    const table = screen.getByRole("table", {
      name: recoveryTable ? "Task recovery" : "Partial and unresolved evidence",
    });
    const handle = within(table).getByRole("separator", {
      name: recoveryTable ? "Resize Project column" : "Resize Project / check column",
    });
    const property = "--dt-col-project";
    fireEvent.doubleClick(handle);
    const initial = table.style.getPropertyValue(property);
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(table.style.getPropertyValue(property)).not.toBe(initial);
    const keyboard = table.style.getPropertyValue(property);
    fireEvent.mouseDown(handle, { button: 0, clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 120 });
    fireEvent.mouseUp(document, { clientX: 120 });
    expect(table.style.getPropertyValue(property)).not.toBe(keyboard);
    if (step.endsWith("reset")) {
      fireEvent.doubleClick(handle);
      expect(table.style.getPropertyValue(property)).toBe(initial);
    }
    return true;
  }
  if (step === "recovery-filter") {
    const label = proof.name ?? "";
    fireEvent.click(screen.getByRole("button", { name: label }));
    const option = label === "Category" ? "unfinished" : "dataforseo";
    fireEvent.click(screen.getByRole("menuitem", { name: option }));
    expect(screen.getByRole("button", { name: label })).toHaveTextContent(option);
    return true;
  }
  if (step === "closed-unknown" || step === "save-deadline") {
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    return true;
  }
  return false;
}
