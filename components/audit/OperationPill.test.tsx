import type { AuditOperation } from "@/lib/queries/audit";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OperationPill } from "./OperationPill";

const operations: AuditOperation[] = ["CREATE", "DELETE", "EXPORT", "IMPORT", "LOGIN", "UPDATE"];

const dotColors: Record<AuditOperation, string> = {
  CREATE: "var(--green)",
  DELETE: "var(--red)",
  EXPORT: "var(--blue)",
  IMPORT: "var(--blue)",
  LOGIN: "var(--purple)",
  UPDATE: "var(--yellow)",
};

const labels: Record<AuditOperation, string> = {
  CREATE: "Create",
  DELETE: "Delete",
  EXPORT: "Export",
  IMPORT: "Import",
  LOGIN: "Login",
  UPDATE: "Update",
};

describe("OperationPill", () => {
  it("renders every operation state with the shared neutral chip border and a status dot", () => {
    for (const operation of operations) {
      const { unmount } = render(<OperationPill operation={operation} />);
      const chip = screen.getByText(labels[operation]);
      expect(chip).toHaveClass("bg-bg-sunken");
      expect(chip).toHaveClass("border-border");
      const dot = chip.querySelector("span[aria-hidden]");
      expect(dot).not.toBeNull();
      unmount();
    }
  });

  it("shows title-case labels through the shared StatusPill defaults", () => {
    for (const operation of operations) {
      const { unmount } = render(<OperationPill operation={operation} />);
      expect(screen.getByText(labels[operation])).toBeInTheDocument();
      expect(screen.queryByText(operation)).not.toBeInTheDocument();
      unmount();
    }
  });

  it("colors the status dot per operation without a local color map", () => {
    for (const operation of operations) {
      const { unmount } = render(<OperationPill operation={operation} />);
      const chip = screen.getByText(labels[operation]);
      const dot = chip.querySelector("span[aria-hidden]");
      expect(dot).toHaveStyle({ backgroundColor: dotColors[operation] });
      unmount();
    }
  });
});
