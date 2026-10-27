import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ResearchCpcCell,
  ResearchDateCell,
  ResearchDifficultyCell,
  ResearchIntentCell,
  ResearchVolumeCell,
} from "./ResearchMetricCells";

const research = {
  volume: 0,
  difficulty: 22,
  cpc: 1.5,
  intent: "commercial" as const,
  trend: [],
  sourceSeed: "desk",
  fetchedAt: "2026-10-01T00:00:00Z",
};
describe("tracked Research metrics", () => {
  it("renders zero, difficulty, currency and localized intent from the Research snapshot", () => {
    render(
      <>
        <ResearchVolumeCell research={research} />
        <ResearchDifficultyCell research={research} />
        <ResearchCpcCell research={research} />
        <ResearchIntentCell research={research} />
      </>,
    );
    expect(screen.getByText("0")).toBeVisible();
    expect(screen.getByText("22")).toBeVisible();
    expect(screen.getByText("$1.50")).toBeVisible();
    expect(screen.getByText("Commercial")).toBeVisible();
  });
  it("identifies mixed market groups rather than presenting one market's value", () => {
    render(
      <>
        <ResearchVolumeCell mixed research={null} />
        <ResearchDateCell mixed research={null} />
      </>,
    );
    expect(screen.getAllByText("mixed")).toHaveLength(2);
    expect(screen.queryByLabelText("No Research data")).not.toBeInTheDocument();
  });
  it("shows an accessible no Research data state rather than fabricated zero", () => {
    render(<ResearchVolumeCell research={null} />);
    expect(screen.getByLabelText("No Research data")).toBeVisible();
  });
});
