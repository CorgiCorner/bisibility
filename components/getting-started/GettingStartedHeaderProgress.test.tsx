import { resolveSetupProgress, type SetupContext } from "@/lib/getting-started/setup-steps";
import { appPath } from "@/lib/routing/app-path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GettingStartedHeaderProgress } from "./GettingStartedHeaderProgress";

const projectRef = "prj_abcdefghijklmnopqrstuvwx";

function context(overrides: Partial<SetupContext> = {}): SetupContext {
  return {
    completedCheckCount: 0,
    competitorSetupOutcome: null,
    competitorSuggestions: [],
    inFlightBatch: null,
    keywordCount: 0,
    keywordIds: [],
    project: { exists: true, name: "Example project", publicRef: projectRef },
    providerExists: false,
    schedule: { mode: "manual" },
    ...overrides,
  };
}

describe("GettingStartedHeaderProgress", () => {
  it("renders 2 of 5 from the supplied resolved setup progress", () => {
    const progress = resolveSetupProgress(context({ keywordCount: 2 }));
    render(
      <GettingStartedHeaderProgress
        completionMode="state-a"
        progress={progress}
        projectRef={projectRef}
      />,
    );

    expect(screen.getByText("Get set up")).toBeInTheDocument();
    expect(screen.getByText("2 of 5 steps")).toBeInTheDocument();
    expect(screen.getByTestId("setup-progress-indicator").querySelector("svg")).toHaveAttribute(
      "data-progress-ring",
    );
    expect(
      screen.getByTestId("setup-progress-indicator").querySelector("[data-progress-arc]"),
    ).toHaveAttribute("stroke-dasharray", "20.1 50.3");
    expect(screen.queryByRole("link", { name: "Go to dashboard" })).not.toBeInTheDocument();
  });

  it("shows a check glyph and no dashboard link for completed state B", () => {
    const progress = resolveSetupProgress(
      context({ completedCheckCount: 1, keywordCount: 2, providerExists: true }),
    );
    expect(progress.doneCount).toBe(4);
    expect(progress.totalCount).toBe(5);

    const { container } = render(
      <GettingStartedHeaderProgress
        completionMode="state-b"
        progress={progress}
        projectRef={projectRef}
      />,
    );

    expect(screen.queryByText("4 of 5 steps")).toBeInTheDocument();
    expect(screen.queryByTestId("setup-progress-check")).not.toBeInTheDocument();
    expect(screen.getByTestId("setup-progress-indicator")).toBeInTheDocument();
    expect(container.querySelector(`a[href="${appPath(projectRef, "dashboard")}"]`)).toBeNull();
    expect(screen.queryByRole("link", { name: "Go to dashboard" })).not.toBeInTheDocument();
  });

  it("does not add a dashboard link on completed state A", () => {
    const progress = resolveSetupProgress(
      context({
        completedCheckCount: 1,
        competitorSetupOutcome: "skipped",
        keywordCount: 2,
        providerExists: true,
      }),
    );
    const { container } = render(
      <GettingStartedHeaderProgress
        completionMode="state-a"
        progress={progress}
        projectRef={projectRef}
      />,
    );

    expect(container.querySelector(`a[href="${appPath(projectRef, "dashboard")}"]`)).toBeNull();
    expect(screen.queryByTestId("setup-progress-check")).not.toBeInTheDocument();
    expect(screen.getByText("5 of 5 steps")).toBeInTheDocument();
    expect(
      screen.getByTestId("setup-progress-indicator").querySelector("[data-progress-arc]"),
    ).toHaveAttribute("stroke-dasharray", "50.3 50.3");
  });

  it("uses settled competitors for the five-step progress ring", () => {
    const progress = resolveSetupProgress(
      context({
        completedCheckCount: 1,
        competitorSetupOutcome: "skipped",
        keywordCount: 2,
        providerExists: true,
      }),
    );
    render(
      <GettingStartedHeaderProgress
        completionMode="state-a"
        progress={progress}
        projectRef={projectRef}
      />,
    );

    expect(screen.getByText("5 of 5 steps")).toBeInTheDocument();
    expect(
      screen.getByTestId("setup-progress-indicator").querySelector("[data-progress-arc]"),
    ).toHaveAttribute("stroke-dasharray", "50.3 50.3");
  });

  it("keeps user-visible copy free of U+2014", () => {
    const progress = resolveSetupProgress(context({ keywordCount: 2 }));
    const { container } = render(
      <GettingStartedHeaderProgress
        completionMode="state-a"
        progress={progress}
        projectRef={projectRef}
      />,
    );
    expect(container.textContent).not.toContain("\u2014");
  });
});
