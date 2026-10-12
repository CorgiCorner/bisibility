import { ProjectRankTrackerMessages } from "@/components/rank-tracker/ProjectRankTrackerMessages";
import { ProjectWriteModeProvider } from "@/components/shell/ProjectWriteModeProvider";
import { fireEvent, render as renderDom, screen, waitFor } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KeywordsGridNotices } from "./KeywordsGridNotices";

function render(children: ReactNode) {
  const result = renderDom(<ProjectRankTrackerMessages>{children}</ProjectRankTrackerMessages>);
  return {
    ...result,
    rerender(nextChildren: ReactNode) {
      result.rerender(<ProjectRankTrackerMessages>{nextChildren}</ProjectRankTrackerMessages>);
    },
  };
}

function renderNotices(props: Partial<ComponentProps<typeof KeywordsGridNotices>> = {}) {
  return render(<KeywordsGridNotices checkStates={[]} projectId="prj_1" {...props} />);
}

describe("KeywordsGridNotices", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  it("does not show historical failures after the current problem has cleared", () => {
    renderNotices({
      checkHealth: {
        budget: { capCents: 1000, exhausted: false, spentCents: 0 },
        currentFailures: { count: 0, latestCheckId: null },
        failed24h: { count: 3, latest: null },
        providerRate: { overrideCents: null, providerId: null },
      },
      checkStates: ["never_checked"],
    });
    expect(
      screen.queryByText("Rank checks failed to produce ranking data."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("No rankings yet")).not.toBeInTheDocument();
  });

  it("remembers dismissal for this incident and shows a new failure or another project", async () => {
    function notice(checkId: string, projectId = "prj_1") {
      return (
        <KeywordsGridNotices
          checkStates={["failed"]}
          projectId={projectId}
          checkHealth={{
            budget: { capCents: 1000, exhausted: false, spentCents: 0 },
            currentFailures: { count: 1, latestCheckId: checkId },
            failed24h: { count: 3, latest: null },
            providerRate: { overrideCents: null, providerId: null },
          }}
        />
      );
    }
    const first = render(notice("check_first"));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss alert" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Dismiss alert" })).not.toBeInTheDocument(),
    );
    first.unmount();
    const next = render(notice("check_first"));
    expect(
      screen.queryByText("Rank checks failed to produce ranking data."),
    ).not.toBeInTheDocument();
    next.rerender(notice("check_new"));
    expect(screen.getByRole("button", { name: "Dismiss alert" })).toBeInTheDocument();
    next.rerender(notice("check_first", "prj_other"));
    expect(screen.getByRole("button", { name: "Dismiss alert" })).toBeInTheDocument();
  });

  it.each([
    { states: [] },
    { states: ["never_checked"] },
    { states: ["never_checked", "never_checked"] },
  ] as const)("reserves no notice surface for unchecked state $states", ({ states }) => {
    const { container } = renderNotices({ checkStates: [...states] });
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/ready for the first rank check/)).not.toBeInTheDocument();
  });

  it("shows failed-check copy instead of a connect-provider cause when a provider is connected", () => {
    renderNotices({
      checkHealth: {
        budget: { capCents: 1000, exhausted: false, spentCents: 100 },
        failed24h: {
          count: 1,
          latest: {
            error: "Provider timeout",
            errorCode: "provider_transient",
            keyword: "rank tracker",
            provider: "serpapi",
          },
        },
        providerRate: { overrideCents: 0.1, providerId: "dataforseo" },
      },
      checkStates: ["failed", "failed"],
    });

    const title = screen.getByText("Rank checks failed to produce ranking data.");
    expect(title).toBeInTheDocument();
    expect(title.closest("output")?.parentElement).not.toHaveClass("border-b");
    expect(screen.getByText("Some keyword positions could not be updated.")).toBeInTheDocument();
    const reviewLink = screen.getByRole("link", { name: "Review check runs" });
    expect(reviewLink.querySelector("svg")).not.toBeInTheDocument();
    expect(screen.queryByText(/connect a serp provider/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /connect provider/i })).not.toBeInTheDocument();
  });

  it("does not render a legacy budget notice on the keyword surface", () => {
    renderNotices({
      checkHealth: {
        budget: { capCents: 1000, exhausted: true, spentCents: 1000 },
        failed24h: { count: 0, latest: null },
        providerRate: { overrideCents: 0.1, providerId: "dataforseo" },
      },
      checkStates: ["never_checked"],
    });

    expect(screen.queryByText(/budget reached/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Edit budget" })).not.toBeInTheDocument();
  });

  it("shows the migration hold instead of claiming checks are queued", () => {
    render(
      <ProjectWriteModeProvider projectRef="prj_1" writeMode="migration_hold">
        <KeywordsGridNotices checkStates={["never_checked"]} projectId="prj_1" />
      </ProjectWriteModeProvider>,
    );

    expect(screen.getByText("Rank checks paused - migration hold.")).toBeInTheDocument();
    expect(screen.queryByText(/first check pending/i)).not.toBeInTheDocument();
  });
});
