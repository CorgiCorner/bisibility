import { fireEvent, screen, within } from "@testing-library/react";
import { expect } from "vitest";
import type { Proof } from "./oss-capability-types";
export async function runStep3(step: string, proof: Proof) {
  if (step === "audit-target-type") {
    const table = screen.getByRole("table", { name: "Instance administrator activity" });
    expect(within(table).getByRole("columnheader", { name: /Target type/ })).toBeInTheDocument();
    return true;
  }
  if (step === "audit-empty") {
    fireEvent.click(screen.getByRole("button", { name: "ops" }));
    return true;
  }
  if (
    step === "audit-resize" ||
    step === "audit-reset" ||
    step === "reference-resize" ||
    step === "reference-reset"
  ) {
    const audit = step.startsWith("audit");
    const table = screen.getByRole("table", {
      name: audit
        ? "Instance administrator activity"
        : "Top project and provider consumption this month",
    });
    const handle = within(table).getAllByRole("separator")[0];
    const property = audit ? "--dt-col-time" : "--dt-col-project";
    fireEvent.doubleClick(handle);
    const initial = table.style.getPropertyValue(property);
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(table.style.getPropertyValue(property)).not.toBe(initial);
    const afterKeyboard = table.style.getPropertyValue(property);
    fireEvent.mouseDown(handle, { button: 0, clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 120 });
    fireEvent.mouseUp(document, { clientX: 120 });
    expect(table.style.getPropertyValue(property)).not.toBe(afterKeyboard);
    if (step.endsWith("reset")) {
      fireEvent.doubleClick(handle);
      expect(table.style.getPropertyValue(property)).toBe(initial);
    }
    return true;
  }
  if (step === "resize" || step === "resize-reset") {
    const table = screen.getByRole("table", { name: "Recorded schedule counters" });
    const handle = within(table).getByRole("separator", { name: "Resize Task column" });
    const root = table;
    fireEvent.doubleClick(handle);
    const before = root.style.getPropertyValue("--dt-col-schedule");
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(root.style.getPropertyValue("--dt-col-schedule")).not.toBe(before);
    const afterKeyboard = root.style.getPropertyValue("--dt-col-schedule");
    fireEvent.mouseDown(handle, { button: 0, clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 120 });
    fireEvent.mouseUp(document, { clientX: 120 });
    expect(root.style.getPropertyValue("--dt-col-schedule")).not.toBe(afterKeyboard);
    if (step === "resize-reset") {
      fireEvent.doubleClick(handle);
      expect(root.style.getPropertyValue("--dt-col-schedule")).toBe(before);
    }
    return true;
  }
  if (step === "copy-project" || step === "copy-reference") {
    // The copy assertion runs after the proof, before the button label changes.
    return true;
  }
  if (step === "sort") {
    const table = screen.getByRole("table", { name: "Recorded schedule counters" });
    const button = within(table).getByRole("button", {
      name: (name) => name.includes(proof.name ?? ""),
    });
    const header = button.closest("[role=columnheader]");
    const before = header?.getAttribute("aria-sort");
    fireEvent.click(button);
    expect(header?.getAttribute("aria-sort")).not.toBe(before);
    return true;
  }
  return false;
}
