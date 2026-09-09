import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { candidate, renderReadyStep } from "./step-first-check-test-support";

describe("StepFirstCheck", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Run check" }));
    expect(await screen.findByText(/3 of 4 checks · \$0\.0060 recorded cost/)).toBeInTheDocument();
  });
});
