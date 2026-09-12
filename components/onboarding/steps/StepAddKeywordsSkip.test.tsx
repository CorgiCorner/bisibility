import { track } from "@/lib/analytics/client";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StepAddKeywordsSkip } from "./StepAddKeywordsSkip";

vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));

describe("StepAddKeywordsSkip", () => {
  beforeEach(() => vi.mocked(track).mockClear());

  it("records the optional no-reason skip before continuing", async () => {
    const calls: string[] = [];
    vi.mocked(track).mockImplementation(() => calls.push("track"));
    const onSkip = vi.fn(() => calls.push("skip"));
    render(<StepAddKeywordsSkip flowState={{ projectId: "prj_1" }} onSkip={onSkip} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Skip adding keywords and open first check" }),
    );

    expect(track).toHaveBeenCalledWith("onboarding_step_skipped", {
      reason: null,
      step: "add_keywords",
    });
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["track", "skip"]);
  });
});
