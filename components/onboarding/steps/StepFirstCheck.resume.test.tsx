import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { candidate, renderReadyStep } from "./step-first-check-test-support";

const completed = {
  status: "completed" as const,
  position: null,
  provider: "dataforseo",
  recordedCostCents: 0.4,
  rankingUrl: null,
  requestedDepth: 20,
};
const checked = { ...candidate("keyword_1", "rank tracker"), previousResult: completed };

describe("resuming the first check", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it("renders the persisted result immediately without another paid check", () => {
    const run = vi.fn();
    renderReadyStep({ initialFirstCheckCandidates: [checked], runFirstCheckPreviewAction: run });
    expect(screen.getByText("Not in top 20")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View dashboard" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run check" })).not.toBeInTheDocument();
    expect(screen.queryByText(/No keywords are ready/)).not.toBeInTheDocument();
    expect(run).not.toHaveBeenCalled();
  });
  it("reuses a result discovered on click and only launches the unchecked matrix target", async () => {
    const run = vi.fn(async () => completed);
    renderReadyStep({
      runFirstCheckPreviewAction: run,
      listFirstCheckCandidatesAction: vi.fn(async () => ({
        candidates: [checked, candidate("keyword_2", "rank tracker", "mobile")],
        hasAnalyticsSource: false,
        isSampleProject: false,
        providerReady: true,
      })),
    });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Run check" })));
    expect(run).toHaveBeenCalledExactlyOnceWith({ keywordId: "kw_keyword_2" });
    expect(screen.getAllByText("Not in top 20")).toHaveLength(2);
  });
  it("resumes observation of an already queued run without launching it again", async () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const fetch = vi.fn(async () =>
      Response.json({
        data: [
          {
            blockedReason: null,
            keyword: { publicId: checked.publicId },
            status: "completed",
            rankCheck: {
              costCents: 0.4,
              position: null,
              provider: "dataforseo",
              rankingUrl: null,
              requestedDepth: 20,
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetch);
    renderReadyStep({
      initialFirstCheckCandidates: [
        { ...checked, previousResult: { status: "queued", runId: "rcr_1" } },
      ],
      runFirstCheckPreviewAction: run,
    });
    expect(screen.getByRole("button", { name: "Queued" })).toBeDisabled();
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByText("Not in top 20")).toBeInTheDocument();
    expect(run).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("keyword=kw_keyword_1"),
      expect.anything(),
    );
  });
  it("keeps separate results for two targets sharing a scheduled run", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const publicId = new URL(url, "https://example.com").searchParams.get("keyword");
        return Response.json({
          data: [
            {
              blockedReason: null,
              keyword: { publicId },
              status: "completed",
              rankCheck: {
                costCents: 0.4,
                position: publicId === "kw_keyword_1" ? 2 : 7,
                provider: "dataforseo",
                rankingUrl: null,
                requestedDepth: 20,
              },
            },
          ],
        });
      }),
    );
    const previousResult = { status: "queued" as const, runId: "rcr_shared" };
    renderReadyStep({
      initialFirstCheckCandidates: [
        { ...checked, previousResult },
        { ...candidate("keyword_2", "rank tracker", "mobile"), previousResult },
      ],
    });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByText("#2")).toBeInTheDocument();
    expect(screen.getByText("#7")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View dashboard" })).toBeInTheDocument();
  });

  it("keeps unchecked targets available after an existing check finishes", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          data: [
            {
              blockedReason: null,
              keyword: { publicId: checked.publicId },
              status: "completed",
              rankCheck: {
                costCents: 0.4,
                position: 2,
                provider: "dataforseo",
                rankingUrl: null,
                requestedDepth: 20,
              },
            },
          ],
        }),
      ),
    );
    renderReadyStep({
      initialFirstCheckCandidates: [
        { ...checked, previousResult: { status: "queued", runId: "rcr_existing" } },
        candidate("keyword_2", "rank tracker", "mobile"),
      ],
    });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByText("#2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run check" })).toBeEnabled();
  });

  it("preserves unchecked targets when retrying an existing failed check", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          data: [
            {
              blockedReason: null,
              keyword: { publicId: checked.publicId },
              status: "failed",
              rankCheck: null,
            },
          ],
        }),
      ),
    );
    const run = vi.fn(async () => completed);
    renderReadyStep({
      runFirstCheckPreviewAction: run,
      initialFirstCheckCandidates: [
        { ...checked, previousResult: { status: "queued", runId: "rcr_existing" } },
        candidate("keyword_2", "rank tracker", "mobile"),
      ],
    });
    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry failed" })));
    expect(run).toHaveBeenCalledExactlyOnceWith({ keywordId: "kw_keyword_1" });
    expect(screen.getByText("Not checked yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run check" })).toBeEnabled();
  });

  it("does not describe a missing selected keyword as a completed first check", async () => {
    renderReadyStep({
      listFirstCheckCandidatesAction: vi.fn(async () => ({
        candidates: [],
        hasAnalyticsSource: false,
        isSampleProject: false,
        providerReady: true,
      })),
    });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Run check" })));
    expect(
      screen.getByText("This keyword is no longer available. Go back to choose a keyword."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View dashboard" })).not.toBeInTheDocument();
  });
});
