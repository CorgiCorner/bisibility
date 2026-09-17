import { renderWithSharedMessages } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CheckStatusChip, type CheckStatusKind } from "./CheckStatusChip";

const KINDS: CheckStatusKind[] = ["completed", "failed", "pending", "running"];

function AllCheckStatusChips() {
  return (
    <>
      {KINDS.map((kind) => (
        <CheckStatusChip key={kind} kind={kind} />
      ))}
    </>
  );
}

describe("CheckStatusChip", () => {
  it("pulses only the running dot and keeps all others static", () => {
    for (const kind of KINDS) {
      const { unmount } = renderWithSharedMessages(<CheckStatusChip kind={kind} />);
      const chip = screen.getByText(
        kind === "completed"
          ? "Completed"
          : kind === "failed"
            ? "Failed"
            : kind === "pending"
              ? "Pending"
              : "Running",
      );
      const dot = chip.querySelector("span[aria-hidden]") as HTMLElement | null;

      expect(dot).not.toBeNull();
      expect(dot).toHaveClass("relative", "h-[6px]", "w-[6px]", "rounded-full");

      if (kind === "running") {
        expect(dot).toHaveClass("bv-ping");
      } else {
        expect(dot).not.toHaveClass("bv-ping");
      }

      expect(dot?.style.animation).toBe("");
      unmount();
    }
  });

  it("keeps the running dot relative, aria-hidden, and free of inline motion", () => {
    renderWithSharedMessages(<CheckStatusChip kind="running" />);

    const dot = screen
      .getByText("Running")
      .querySelector("span[aria-hidden]") as HTMLElement | null;
    expect(dot).toHaveAttribute("aria-hidden");
    expect(dot).toHaveClass("relative", "bv-ping");
    expect(dot?.style.animation).toBe("");
  });

  it("renders default labels for all four kinds", () => {
    renderWithSharedMessages(<AllCheckStatusChips />);

    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
  });
});
