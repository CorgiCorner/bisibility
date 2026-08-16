import { deferred } from "@/tests/deferred";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { type FirstCheckRunActions, useFirstCheckRun } from "./use-first-check-run";

function DoubleStartHarness({ actions }: { actions: FirstCheckRunActions }) {
  const { start, state } = useFirstCheckRun(actions);
  return (
    <button
      data-status={state.status}
      onClick={() => {
        void start({ keywordText: "rank tracker", projectId: "prj_1" });
        void start({ keywordText: "rank tracker", projectId: "prj_1" });
      }}
      type="button"
    >
      Start twice
    </button>
  );
}

function MissingKeywordHarness({ actions }: { actions: FirstCheckRunActions }) {
  const { start, state } = useFirstCheckRun(actions);
  return (
    <div>
      <button onClick={() => void start({ projectId: "prj_1" })} type="button">
        Start without keyword
      </button>
      <span>{state.message}</span>
    </div>
  );
}

describe("StepFirstCheck", () => {
  it("runs only one preview when start is called twice before render catches up", async () => {
    const candidates = deferred<{
      candidates: [];
      hasAnalyticsSource: false;
      isSampleProject: false;
      providerReady: true;
    }>();
    const listFirstCheckCandidatesAction = vi.fn(() => candidates.promise);

    render(
      <DoubleStartHarness
        actions={{
          listFirstCheckCandidatesAction,
          runFirstCheckPreviewAction: vi.fn(),
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start twice" }));

    await waitFor(() => expect(listFirstCheckCandidatesAction).toHaveBeenCalledTimes(1));
    candidates.resolve({
      candidates: [],
      hasAnalyticsSource: false,
      isSampleProject: false,
      providerReady: true,
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Start twice" })).toHaveAttribute(
        "data-status",
        "completed",
      ),
    );
  });

  it("rejects an unscoped preview instead of falling back to multiple keyword texts", async () => {
    const listFirstCheckCandidatesAction = vi.fn();
    render(
      <MissingKeywordHarness
        actions={{ listFirstCheckCandidatesAction, runFirstCheckPreviewAction: vi.fn() }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start without keyword" }));

    expect(
      await screen.findByText("Select one keyword for the sample checks."),
    ).toBeInTheDocument();
    expect(listFirstCheckCandidatesAction).not.toHaveBeenCalled();
  });
});
