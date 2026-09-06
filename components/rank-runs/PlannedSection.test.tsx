import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlannedSection } from "./PlannedSection";
import { plannedRun } from "./runs-fixtures";

describe("PlannedSection", () => {
  it("uses singular labels for one keyword and one target", () => {
    render(
      <PlannedSection
        budgetExhausted={false}
        onRunNow={vi.fn()}
        onSkip={vi.fn()}
        pendingRunId={null}
        runs={[{ ...plannedRun, keywordCount: 1, targetCount: 1 }]}
      />,
    );

    expect(screen.getByText("1 keyword / 1 target")).toBeVisible();
  });
});
