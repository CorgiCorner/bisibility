import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { candidate, renderReadyStep } from "./step-first-check-test-support";

function response(status: string) {
  return Response.json({
    data: [
      {
        blockedReason: null,
        keyword: { publicId: "kw_keyword_1" },
        status,
        rankCheck:
          status === "completed"
            ? {
                costCents: 0.4,
                position: null,
                provider: "dataforseo",
                rankingUrl: null,
                requestedDepth: 20,
              }
            : null,
      },
    ],
  });
}

describe("onboarding queued check", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("replaces queued with the persisted result and prevents a second launch while waiting", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response("queued"))
      .mockResolvedValueOnce(response("running"))
      .mockResolvedValueOnce(response("completed"));
    vi.stubGlobal("fetch", fetch);
    const run = vi.fn(async () => ({ status: "queued" as const, runId: "rcr_1" }));
    renderReadyStep({
      listFirstCheckCandidatesAction: vi.fn(async () => ({
        candidates: [candidate("keyword_1", "rank tracker")],
        hasAnalyticsSource: false,
        isSampleProject: false,
        providerReady: true,
      })),
      runFirstCheckPreviewAction: run,
    });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Run check" })));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByRole("button", { name: "Queued" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Queued" }));
    expect(run).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(screen.getByText("Checking...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Running 1 sample check" })).toBeDisabled();
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(screen.getByText("Not in top 20")).toBeInTheDocument();
    expect(screen.getByText(/1 check · \$0\.0040 recorded cost/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View dashboard" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run check" })).not.toBeInTheDocument();
    expect(run).toHaveBeenCalledTimes(1);
  });
});
