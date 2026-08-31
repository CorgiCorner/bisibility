import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StepFirstCheckCompletion } from "./StepFirstCheckCompletion";

function renderCompletion(frequency: "daily" | "manual" | "paused", keywordCount: number) {
  render(
    <StepFirstCheckCompletion
      frequency={frequency}
      frequencyLabel={
        frequency === "daily" ? "Daily" : frequency === "manual" ? "Manual" : "Paused"
      }
      keywordCount={keywordCount}
      nextCheckAt="2026-08-30T06:00:00.000Z"
      projectId="prj_1"
      timezone="UTC"
    />,
  );
}

describe("StepFirstCheckCompletion grammar", () => {
  it.each([
    ["manual", 1, /Your 1 keyword is ready/],
    ["manual", 2, /Your 2 keywords are ready/],
    ["paused", 1, /Your 1 keyword is paused/],
    ["paused", 2, /Your 2 keywords are paused/],
    ["daily", 1, /Your 1 keyword runs automatically/],
    ["daily", 2, /Your 2 keywords run automatically/],
  ] as const)("uses natural %s grammar for %i keywords", (frequency, count, copy) => {
    renderCompletion(frequency, count);
    expect(screen.getByText(copy)).toBeInTheDocument();
    expect(screen.queryByText(/All 1 keyword/)).not.toBeInTheDocument();
  });
});
