import type { AuditEntry } from "@/lib/queries/audit";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { auditColumns } from "./audit-columns";

function renderStatusCell(status: AuditEntry["status"]) {
  const column = auditColumns.find((col) => col.field === "status");
  const cell = column?.renderCell?.({ row: { status } } as never);
  return render(cell as ReactElement);
}

describe("audit-columns status cell", () => {
  it("renders success as a shared neutral StatusPill with a green dot", () => {
    renderStatusCell("success");
    const chip = screen.getByText("Success");
    expect(chip).toHaveClass("bg-bg-sunken");
    expect(chip).toHaveClass("border-border");
    const dot = chip.querySelector("span[aria-hidden]");
    expect(dot).toHaveStyle({ backgroundColor: "var(--green)" });
  });

  it("renders failed as a shared neutral StatusPill with a red dot", () => {
    renderStatusCell("failed");
    const chip = screen.getByText("Failed");
    expect(chip).toHaveClass("bg-bg-sunken");
    expect(chip).toHaveClass("border-border");
    const dot = chip.querySelector("span[aria-hidden]");
    expect(dot).toHaveStyle({ backgroundColor: "var(--red)" });
  });
});
