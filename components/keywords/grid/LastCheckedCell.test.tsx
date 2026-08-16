import { ProjectWriteModeProvider } from "@/components/shell/ProjectWriteModeProvider";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { LastCheckedCell } from "./LastCheckedCell";

const now = new Date("2026-07-03T12:00:00.000Z");

function withProvider(writeMode: "active" | "migration_hold" = "active") {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ProjectWriteModeProvider projectRef="prj_1" writeMode={writeMode}>
        {children}
      </ProjectWriteModeProvider>
    );
  };
}

describe("LastCheckedCell", () => {
  it("renders a completed chip with the relative-time label for a fresh check", () => {
    render(
      <LastCheckedCell lastCheckAt="2026-07-03T09:00:00.000Z" now={now} status="completed" />,
      { wrapper: withProvider() },
    );

    const chip = screen.getByText("3h ago");
    expect(chip).toHaveClass(
      "inline-flex",
      "items-center",
      "rounded-full",
      "font-mono",
      "font-semibold",
    );
  });

  it("renders a pending chip for a stale check", () => {
    render(
      <LastCheckedCell lastCheckAt="2026-06-25T12:00:00.000Z" now={now} status="completed" />,
      { wrapper: withProvider() },
    );

    expect(screen.getByText("8d ago")).toHaveClass("inline-flex", "rounded-full", "font-mono");
  });

  it("renders a running chip", () => {
    render(<LastCheckedCell lastCheckAt="2026-07-03T11:58:00.000Z" now={now} status="running" />, {
      wrapper: withProvider(),
    });

    expect(screen.getByText("Running")).toHaveClass("inline-flex", "rounded-full", "font-mono");
  });

  it("renders a failed chip", () => {
    render(<LastCheckedCell lastCheckAt="2026-07-03T11:00:00.000Z" now={now} status="failed" />, {
      wrapper: withProvider(),
    });

    expect(screen.getByText("Failed")).toHaveClass("inline-flex", "rounded-full", "font-mono");
  });

  it("renders an awaiting-first-check chip when no check has run", () => {
    render(<LastCheckedCell lastCheckAt={null} now={now} status={null} />, {
      wrapper: withProvider(),
    });

    expect(screen.getByText("Awaiting first check")).toHaveClass(
      "inline-flex",
      "rounded-full",
      "font-mono",
    );
  });

  it("renders a paused chip in read-only mode", () => {
    render(
      <LastCheckedCell lastCheckAt="2026-07-03T09:00:00.000Z" now={now} status="completed" />,
      { wrapper: withProvider("migration_hold") },
    );

    expect(screen.getByText("Paused - migration hold")).toHaveClass(
      "inline-flex",
      "rounded-full",
      "font-mono",
    );
  });
});
