import { resolveSetupProgress, type SetupContext } from "@/lib/getting-started/setup-steps";
import { appPath } from "@/lib/routing/app-path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GettingStartedHeaderProgress } from "./GettingStartedHeaderProgress";

const projectRef = "prj_abcdefghijklmnopqrstuvwx";

function context(overrides: Partial<SetupContext> = {}): SetupContext {
  return {
    completedCheckCount: 0,
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
  it("renders 2 / 4 from the supplied resolved setup progress", () => {
    const progress = resolveSetupProgress(context({ keywordCount: 2 }));
    render(
      <GettingStartedHeaderProgress
        completionMode="state-a"
        progress={progress}
        projectRef={projectRef}
      />,
    );

    expect(screen.getByText("Get set up")).toBeInTheDocument();
    expect(screen.getByText("2 / 4 steps")).toBeInTheDocument();
    expect(screen.getByTestId("setup-progress-indicator").querySelector("svg")).toHaveAttribute(
      "data-progress-ring",
    );
    expect(
      screen.getByTestId("setup-progress-indicator").querySelector("[data-progress-arc]"),
    ).toHaveAttribute("stroke-dasharray", "25.1 50.3");
    expect(screen.queryByRole("link", { name: "Go to dashboard" })).not.toBeInTheDocument();
  });

  it("shows a check glyph and the only header dashboard CTA for completed state B", () => {
    const progress = resolveSetupProgress(
      context({ completedCheckCount: 1, keywordCount: 2, providerExists: true }),
    );
    expect(progress.doneCount).toBe(4);
    expect(progress.totalCount).toBe(4);

    const { container } = render(
      <GettingStartedHeaderProgress
        completionMode="state-b"
        progress={progress}
        projectRef={projectRef}
      />,
    );

    expect(screen.queryByText("4 / 4 steps")).not.toBeInTheDocument();
    expect(screen.getByTestId("setup-progress-check")).toBeInTheDocument();
    const dashboardLinks = container.querySelectorAll(
      `a[href="${appPath(projectRef, "dashboard")}"]`,
    );
    expect(dashboardLinks).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Go to dashboard" })).toBeVisible();
  });

  it("hides the completed state A dashboard CTA", () => {
    const progress = resolveSetupProgress(
      context({ completedCheckCount: 1, keywordCount: 2, providerExists: true }),
    );
    const { container } = render(
      <GettingStartedHeaderProgress
        completionMode="state-a"
        progress={progress}
        projectRef={projectRef}
      />,
    );

    const cta = container.querySelector(`a[href="${appPath(projectRef, "dashboard")}"]`);
    expect(cta).not.toBeNull();
    expect(cta).not.toBeVisible();
    expect(screen.queryByTestId("setup-progress-check")).not.toBeInTheDocument();
    expect(screen.getByText("4 / 4 steps")).toBeInTheDocument();
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
