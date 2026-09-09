import type { AuditEntry } from "@/lib/queries/audit";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { auditColumns } from "./audit-columns";

const entry: AuditEntry = {
  actor: { email: "auditor@example.com", id: "user_1", initials: "AU", name: "Auditor" },
  diff: [],
  eventName: "Provider test",
  eventType: "system",
  id: "audit_1",
  metadata: {
    app_version: "Not recorded",
    correlation_id: "corr_1",
    event_id: "audit_1",
    user_agent: "Not recorded",
  },
  operation: "UPDATE",
  resource: { id: "provider_1", name: "provider_1", type: "provider" },
  source: { channel: "ui", ip: "Not recorded" },
  status: "success",
  timestamp: "2026-07-16T14:32:00.000Z",
  timestampLabel: "2026-07-16 14:32:00 UTC",
};

function renderCell(columnId: string, row = entry, onOpenEntry = vi.fn()) {
  const column = auditColumns({ onOpenEntry }).find((candidate) => candidate.id === columnId);
  const cell = typeof column?.cell === "function" ? column.cell : undefined;
  return { onOpenEntry, ...render(cell?.({ row: { original: row } } as never) as ReactElement) };
}

describe("audit-columns", () => {
  it("uses the 4px sizing contract", () => {
    const columns = auditColumns({ onOpenEntry: vi.fn() });

    expect(columns.map(({ id, minSize, size }) => ({ id, minSize, size }))).toEqual([
      { id: "timestamp", minSize: 172, size: 200 },
      { id: "eventName", minSize: 232, size: 272 },
      { id: "resource", minSize: 240, size: 280 },
      { id: "operation", minSize: 112, size: 120 },
      { id: "status", minSize: 112, size: 120 },
    ]);
  });

  it("renders success as a shared neutral StatusPill with a green dot", () => {
    renderCell("status");
    const chip = screen.getByText("Success");
    expect(chip).toHaveClass("bg-bg-sunken", "border-border");
    expect(chip.querySelector("span[aria-hidden]")).toHaveStyle({
      backgroundColor: "var(--green)",
    });
  });

  it("renders failed as a shared neutral StatusPill with a red dot", () => {
    renderCell("status", { ...entry, status: "failed" });
    const chip = screen.getByText("Failed");
    expect(chip).toHaveClass("bg-bg-sunken", "border-border");
    expect(chip.querySelector("span[aria-hidden]")).toHaveStyle({ backgroundColor: "var(--red)" });
  });

  it("makes the actor and event title a focusable detail control", () => {
    const onOpenEntry = vi.fn();
    renderCell("eventName", entry, onOpenEntry);
    const open = screen.getByRole("button", { name: "Open audit event Provider test" });

    fireEvent.click(open);

    expect(onOpenEntry).toHaveBeenCalledWith(entry);
  });
});
