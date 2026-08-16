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

    fireEvent.click(screen.getByRole("button", { name: "Keyword used for the sample checks" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "seo api" }));
    fireEvent.click(screen.getByRole("button", { name: "Run 4 sample checks" }));

    await waitFor(() =>
      expect(listFirstCheckCandidatesAction).toHaveBeenCalledWith({
        keywordText: "seo api",
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
    renderReadyStep({ keywordDraft: undefined, listFirstCheckCandidatesAction });

    expect(screen.queryByText("First available keyword")).not.toBeInTheDocument();
    expect(await screen.findByText("persisted rank tracker")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run 1 sample check" }));

    await waitFor(() => expect(listFirstCheckCandidatesAction).toHaveBeenCalledTimes(2));
    expect(listFirstCheckCandidatesAction).toHaveBeenNthCalledWith(1, {
      limit: 1,
      projectId: "prj_1",
    });
    expect(listFirstCheckCandidatesAction).toHaveBeenNthCalledWith(2, {
      keywordText: "persisted rank tracker",
      limit: 1,
      projectId: "prj_1",
    });
  });

  it("retries a failed resumed keyword load in place and enables preview", async () => {
    let attempts = 0;
    const listFirstCheckCandidatesAction = vi.fn(async () => {
      if (attempts++ === 0) throw new Error("Saved keywords could not be loaded.");
      return {
        candidates: [candidate("keyword_1", "persisted rank tracker")],
        hasAnalyticsSource: false,
        isSampleProject: false,
        providerReady: true,
      };
    });
    renderReadyStep({ keywordDraft: undefined, listFirstCheckCandidatesAction });

    const loadError = await screen.findByRole("alert");
    expect(loadError).toHaveTextContent("Saved keywords could not be loaded.");
    expect(loadError).toHaveClass("m-0");
    expect(loadError).not.toHaveClass("mt-2");
    expect(screen.getByRole("button", { name: "Run 1 sample check" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry loading keyword" }));

    expect(await screen.findByText("persisted rank tracker")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run 1 sample check" })).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(listFirstCheckCandidatesAction).toHaveBeenCalledTimes(2);
  });

  it("renders the selected sample targets incrementally without queuing the remaining keywords", async () => {
    const first = deferred<{
      position: null;
      provider: string;
      rankingUrl: null;
      status: "completed";
    }>();
    const second = deferred<{
      position: number;
      provider: string;
      rankingUrl: string;
      status: "completed";
    }>();
    const runFirstCheckPreviewAction = vi.fn((input: { keywordId: string }) =>
      input.keywordId === "keyword_1" ? first.promise : second.promise,
    );
    const queueFirstChecksAction = vi.fn();
    const legacyQueueAction = { queueFirstChecksAction };

    renderReadyStep({ ...legacyQueueAction, runFirstCheckPreviewAction });
    fireEvent.click(screen.getByRole("button", { name: /Run \d+ sample checks?/i }));

    await waitFor(() => expect(screen.getAllByText("Checking...")).toHaveLength(2));
    await waitFor(() => expect(runFirstCheckPreviewAction).toHaveBeenCalledTimes(1));
    expect(runFirstCheckPreviewAction).toHaveBeenLastCalledWith({ keywordId: "keyword_1" });
    expect(screen.getByLabelText("Desktop device")).toBeInTheDocument();
    expect(screen.getByLabelText("Mobile device")).toBeInTheDocument();
    expect(screen.getAllByText("United States")).toHaveLength(3);

    first.resolve({
      position: null,
      provider: "dataforseo",
      rankingUrl: null,
      status: "completed",
    });

    await waitFor(() => expect(screen.getByText("Not in top 100")).toBeInTheDocument());
    await waitFor(() => expect(runFirstCheckPreviewAction).toHaveBeenCalledTimes(2));
    expect(runFirstCheckPreviewAction).toHaveBeenLastCalledWith({ keywordId: "keyword_2" });

    second.resolve({
      position: 4,
      provider: "dataforseo",
      rankingUrl: "https://example.com/page",
      status: "completed",
    });
    expect(await screen.findByText("#4 / example.com/page")).toBeInTheDocument();
    expect(
      screen.getByText("Sample done. Every keyword follows your daily schedule from here."),
    ).toBeInTheDocument();
    expect(queueFirstChecksAction).not.toHaveBeenCalled();
  });

  it("retries only failed sample targets and keeps successful results", async () => {
    let failedAttempts = 0;
    const runFirstCheckPreviewAction = vi.fn(async (input: { keywordId: string }) => {
      if (input.keywordId === "keyword_2" && failedAttempts++ === 0) {
        return {
          code: "budget_exhausted" as const,
          message: "Monthly rank-check budget reached.",
          status: "failed" as const,
        };
      }
      return {
        position: input.keywordId === "keyword_1" ? 2 : 4,
        provider: "dataforseo",
        rankingUrl: `https://example.com/${input.keywordId}`,
        status: "completed" as const,
      };
    });

    renderReadyStep({ runFirstCheckPreviewAction });
    fireEvent.click(screen.getByRole("button", { name: /Run \d+ sample checks?/i }));

    expect(await screen.findByText("Monthly rank-check budget reached.")).toBeInTheDocument();
    expect(screen.getByText("#2 / example.com/keyword_1")).toBeInTheDocument();
    expect(
      screen.getByText("1 of 2 checks failed. Successful results are kept."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry failed" }));

    expect(await screen.findByText("#4 / example.com/keyword_2")).toBeInTheDocument();
    expect(runFirstCheckPreviewAction).toHaveBeenCalledTimes(3);
    expect(runFirstCheckPreviewAction).toHaveBeenLastCalledWith({ keywordId: "keyword_2" });
    expect(screen.queryByText("Monthly rank-check budget reached.")).not.toBeInTheDocument();
  });
});
