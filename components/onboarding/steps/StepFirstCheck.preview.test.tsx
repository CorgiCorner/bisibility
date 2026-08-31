import { deferred } from "@/tests/deferred";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { candidate, renderReadyStep } from "./step-first-check-test-support";

describe("StepFirstCheck", () => {
  it("runs the selected keyword across the market and device matrix", async () => {
    const listFirstCheckCandidatesAction = vi.fn(async () => ({
      candidates: [],
      hasAnalyticsSource: false,
      isSampleProject: false,
      providerReady: true,
    }));
    renderReadyStep({
      defaults: {
        city: null,
        country: "United States",
        cronExpression: "0 6 * * *",
        device: "desktop",
        devices: ["desktop", "mobile"],
        frequency: "daily",
        jitterMinutes: 60,
        locationKey: "US",
        locationSelections: [
          {
            canonicalKey: "US",
            countryCode: "US",
            displayName: "United States",
            kind: "country",
            languageCode: "en",
            languageLabel: "English",
          },
          {
            canonicalKey: "ES@en",
            countryCode: "ES",
            displayName: "Spain",
            kind: "country",
            languageCode: "en",
            languageLabel: "English",
          },
        ],
        locations: ["US", "ES@en"],
        projectId: "prj_1",
        serpDepth: 100,
        timezone: "UTC",
      },
      keywordDraft: "rank tracker\nseo api",
      listFirstCheckCandidatesAction,
    });

    fireEvent.click(screen.getByRole("button", { name: "Run a test check (1 keyword)" }));

    await waitFor(() =>
      expect(listFirstCheckCandidatesAction).toHaveBeenCalledWith({
        keywordText: "rank tracker",
        limit: 4,
        projectId: "prj_1",
      }),
    );
  });

  it("resumes with one persisted keyword instead of an unfiltered first sentinel", async () => {
    const listFirstCheckCandidatesAction = vi.fn(async () => ({
      candidates: [candidate("keyword_1", "persisted rank tracker")],
      hasAnalyticsSource: false,
      isSampleProject: false,
      providerReady: true,
    }));
    renderReadyStep({
      initialKeywordText: "persisted rank tracker",
      keywordDraft: undefined,
      listFirstCheckCandidatesAction,
    });

    expect(screen.queryByText("First available keyword")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Run a test check (1 keyword)" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Run a test check (1 keyword)" }));

    await waitFor(() => expect(listFirstCheckCandidatesAction).toHaveBeenCalledTimes(1));
    expect(listFirstCheckCandidatesAction).toHaveBeenCalledWith({
      keywordText: "persisted rank tracker",
      limit: 1,
      projectId: "prj_1",
    });
  });

  it("retries a resumed keyword load in place and enables preview", async () => {
    const listFirstCheckCandidatesAction = vi.fn(async () => ({
      candidates: [candidate("keyword_1", "persisted rank tracker")],
      hasAnalyticsSource: false,
      isSampleProject: false,
      providerReady: true,
    }));
    renderReadyStep({ keywordDraft: undefined, listFirstCheckCandidatesAction });
    expect(screen.getByRole("button", { name: "Run a test check (1 keyword)" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry loading keyword" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Run a test check (1 keyword)" })).toBeEnabled(),
    );
    expect(listFirstCheckCandidatesAction).toHaveBeenCalledTimes(1);
  });

  it("renders the selected sample targets incrementally without queuing the remaining keywords", async () => {
    const first = deferred<{
      position: null;
      recordedCostCents: 0;
      provider: string;
      rankingUrl: null;
      status: "completed";
    }>();
    const second = deferred<{
      position: number;
      recordedCostCents: 0;
      provider: string;
      rankingUrl: string;
      status: "completed";
    }>();
    const runFirstCheckPreviewAction = vi.fn((input: { keywordId: string }) =>
      input.keywordId === "kw_keyword_1" ? first.promise : second.promise,
    );
    const queueFirstChecksAction = vi.fn();
    const legacyQueueAction = { queueFirstChecksAction };

    renderReadyStep({ ...legacyQueueAction, runFirstCheckPreviewAction });
    fireEvent.click(screen.getByRole("button", { name: "Run a test check (1 keyword)" }));

    await waitFor(() => expect(screen.getAllByText("Checking...")).toHaveLength(2));
    await waitFor(() => expect(runFirstCheckPreviewAction).toHaveBeenCalledTimes(1));
    expect(runFirstCheckPreviewAction).toHaveBeenLastCalledWith({ keywordId: "kw_keyword_1" });
    expect(screen.getByLabelText("Desktop device")).toBeInTheDocument();
    expect(screen.getByLabelText("Mobile device")).toBeInTheDocument();
    expect(screen.getAllByText("United States")).toHaveLength(2);
    expect(
      screen.getByLabelText("Tracking: 3 keywords · Google · United States (English) · 1 device"),
    ).toBeInTheDocument();

    first.resolve({
      position: null,
      recordedCostCents: 0,
      provider: "dataforseo",
      rankingUrl: null,
      status: "completed",
    });

    await waitFor(() => expect(screen.getByText("Not in top 100")).toBeInTheDocument());
    await waitFor(() => expect(runFirstCheckPreviewAction).toHaveBeenCalledTimes(2));
    expect(runFirstCheckPreviewAction).toHaveBeenLastCalledWith({ keywordId: "kw_keyword_2" });

    second.resolve({
      position: 4,
      recordedCostCents: 0,
      provider: "dataforseo",
      rankingUrl: "https://example.com/page",
      status: "completed",
    });
    expect(await screen.findByText("#4 / example.com/page")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Sample checks finished. Every keyword follows your daily schedule from here.",
      ),
    ).toBeInTheDocument();
    expect(queueFirstChecksAction).not.toHaveBeenCalled();
  });

  it("uses natural failure copy when the only sample check fails", async () => {
    renderReadyStep({
      listFirstCheckCandidatesAction: vi.fn(async () => ({
        candidates: [candidate("keyword_1", "rank tracker")],
        hasAnalyticsSource: false,
        isSampleProject: false,
        providerReady: true,
      })),
      runFirstCheckPreviewAction: vi.fn(async () => ({
        code: "failed" as const,
        message: "The provider could not complete this check.",
        status: "failed" as const,
      })),
    });

    fireEvent.click(screen.getByRole("button", { name: "Run a test check (1 keyword)" }));

    expect(await screen.findByText(/0 of 1 check · \$0\.0000 recorded cost/)).toBeInTheDocument();
    expect(
      screen.getByText(
        "The sample check finished with an issue. You can retry the failed check below. Every keyword still follows your daily schedule.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("1 of 1 checks failed")).not.toBeInTheDocument();
  });

  it("retries only failed sample targets and keeps successful results", async () => {
    let failedAttempts = 0;
    const runFirstCheckPreviewAction = vi.fn(async (input: { keywordId: string }) => {
      if (input.keywordId === "kw_keyword_2" && failedAttempts++ === 0) {
        return {
          code: "budget_exhausted" as const,
          message: "Monthly rank-check budget reached.",
          status: "failed" as const,
        };
      }
      return {
        position: input.keywordId === "kw_keyword_1" ? 2 : 4,
        recordedCostCents: 0,
        provider: "dataforseo",
        rankingUrl: `https://example.com/${input.keywordId.replace("kw_", "")}`,
        status: "completed" as const,
      };
    });

    renderReadyStep({ runFirstCheckPreviewAction });
    fireEvent.click(screen.getByRole("button", { name: "Run a test check (1 keyword)" }));

    expect(await screen.findByText("Monthly rank-check budget reached.")).toBeInTheDocument();
    expect(screen.getByText("#2 / example.com/keyword_1")).toBeInTheDocument();
    expect(screen.getByText(/1 of 2 checks · \$0\.0000 recorded cost/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry failed" }));

    expect(await screen.findByText("#4 / example.com/keyword_2")).toBeInTheDocument();
    expect(runFirstCheckPreviewAction).toHaveBeenCalledTimes(3);
    expect(runFirstCheckPreviewAction).toHaveBeenLastCalledWith({ keywordId: "kw_keyword_2" });
    expect(screen.queryByText("Monthly rank-check budget reached.")).not.toBeInTheDocument();
  });

  it("totals recorded persisted cost across physical checks for one logical keyword", async () => {
    renderReadyStep({
      listFirstCheckCandidatesAction: vi.fn(async () => ({
        candidates: [candidate("one", "rank tracker"), candidate("two", "rank tracker", "mobile")],
        hasAnalyticsSource: false,
        isSampleProject: false,
        providerReady: true,
      })),
      runFirstCheckPreviewAction: vi
        .fn()
        .mockResolvedValueOnce({
          position: 2,
          provider: "dataforseo",
          rankingUrl: null,
          recordedCostCents: 0.2,
          status: "completed",
        })
        .mockResolvedValueOnce({
          position: 3,
          provider: "dataforseo",
          rankingUrl: null,
          recordedCostCents: 0.35,
          status: "completed",
        }),
    });

    fireEvent.click(screen.getByRole("button", { name: "Run a test check (1 keyword)" }));

    expect(await screen.findByText(/\$0\.0055 recorded cost/)).toBeInTheDocument();
    const dashboard = screen.getByRole("button", { name: "Go to dashboard" });
    expect(dashboard).toHaveClass("MuiButton-contained", "MuiButton-sizeLarge");
    expect(dashboard).toHaveAttribute("type", "submit");
    expect(screen.queryByRole("button", { name: "Open app" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Run a test check (1 keyword)" })).toBeNull();
    expect(
      screen
        .getAllByRole("button")
        .filter((button) => button.classList.contains("MuiButton-contained")),
    ).toHaveLength(1);
  });

  it("shows matrix transparency and mixed persisted-cost shortfall", async () => {
    renderReadyStep({
      defaults: {
        country: "United States",
        cronExpression: null,
        device: "desktop",
        devices: ["desktop", "mobile"],
        frequency: "manual",
        jitterMinutes: 60,
        locationSelections: [
          {
            canonicalKey: "US",
            countryCode: "US",
            displayName: "United States",
            kind: "country",
            languageCode: "en",
            languageLabel: "English",
          },
          {
            canonicalKey: "PL",
            countryCode: "PL",
            displayName: "Poland",
            kind: "country",
            languageCode: "pl",
            languageLabel: "Polish",
          },
        ],
        locations: ["US", "PL"],
        projectId: "prj_1",
        timezone: "UTC",
      },
      listFirstCheckCandidatesAction: vi.fn(async () => ({
        candidates: [
          candidate("1", "rank tracker"),
          candidate("2", "rank tracker", "mobile"),
          {
            ...candidate("3", "rank tracker"),
            market: { languageLabel: "Polish", locationLabel: "Poland" },
          },
          {
            ...candidate("4", "rank tracker", "mobile"),
            market: { languageLabel: "Polish", locationLabel: "Poland" },
          },
        ],
        hasAnalyticsSource: false,
        isSampleProject: false,
        providerReady: true,
      })),
      runFirstCheckPreviewAction: vi.fn(async ({ keywordId }) =>
        keywordId === "kw_4"
          ? { code: "failed" as const, message: "Failed", status: "failed" as const }
          : {
              position: 2,
              provider: "dataforseo",
              rankingUrl: null,
              recordedCostCents: 0.2,
              status: "completed" as const,
            },
      ),
    });
    expect(screen.getByText("1 keyword · 2 markets · both devices · 4 checks")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run a test check (1 keyword)" }));
    expect(await screen.findByText(/3 of 4 checks · \$0\.0060 recorded cost/)).toBeInTheDocument();
  });
});
