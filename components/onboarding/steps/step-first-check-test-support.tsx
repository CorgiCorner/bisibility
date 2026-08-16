import { render } from "@testing-library/react";
import { vi } from "vitest";
import { StepFirstCheck } from "./StepFirstCheck";

export function candidate(id: string, text: string, device: "desktop" | "mobile" = "desktop") {
  return {
    device,
    id,
    market: { languageLabel: "English", locationLabel: "United States" },
    publicId: `kw_${id}`,
    text,
  };
}

export function renderReadyStep(overrides: Partial<Parameters<typeof StepFirstCheck>[0]> = {}) {
  return render(
    <StepFirstCheck
      flowState={{ projectId: "prj_1", providerId: "dataforseo" }}
      getObservedPositionsAction={vi.fn(async () => [])}
      keywordCount={3}
      keywordDraft="rank tracker\nseo api"
      listFirstCheckCandidatesAction={vi.fn(async () => ({
        candidates: [
          candidate("keyword_1", "rank tracker"),
          candidate("keyword_2", "rank tracker", "mobile"),
        ],
        hasAnalyticsSource: false,
        isSampleProject: false,
        providerReady: true,
      }))}
      providerConnected
      runFirstCheckPreviewAction={vi.fn(async () => ({
        position: 2,
        provider: "dataforseo",
        rankingUrl: "https://example.com/rank-tracker",
        status: "completed" as const,
      }))}
      {...overrides}
    />,
  );
}
