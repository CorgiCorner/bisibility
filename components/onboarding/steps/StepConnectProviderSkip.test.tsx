import { track } from "@/lib/analytics/client";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StepConnectProviderSkip } from "./StepConnectProviderSkip";

vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));

const values = {
  login: "",
  projectId: "prj_abcdefghijklmnopqrstuvwx",
  providerId: "serpapi" as const,
  secret: "",
};

describe("StepConnectProviderSkip", () => {
  beforeEach(() => vi.mocked(track).mockClear());

  it("records the optional no-reason skip before continuing", async () => {
    const calls: string[] = [];
    vi.mocked(track).mockImplementation(() => calls.push("track"));
    const onSkip = vi.fn(() => calls.push("skip"));
    render(<StepConnectProviderSkip getValues={() => values} onSkip={onSkip} />);

    await userEvent.click(screen.getByRole("button", { name: /Skip provider connection/ }));

    expect(track).toHaveBeenCalledWith("onboarding_step_skipped", {
      reason: null,
      step: "connect_source",
    });
    expect(onSkip).toHaveBeenCalledWith(values);
    expect(calls).toEqual(["track", "skip"]);
  });
});
