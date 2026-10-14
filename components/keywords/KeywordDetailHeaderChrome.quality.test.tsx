import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KeywordDetailHeaderChrome } from "./KeywordDetailHeaderChrome";
import {
  detailMetadataFixture,
  detailQualityFixture,
  unavailableDetailQuality,
} from "./keyword-detail-quality.test-fixture";

describe("installed detail header quality sidecar", () => {
  it("uses qualified current/Best/baseline dates rather than the legacy90 predecessor or 30d label", () => {
    const quality = detailQualityFixture();
    render(
      <KeywordDetailHeaderChrome
        actions={null}
        keyword={detailMetadataFixture()}
        quality={quality}
        timeZone="UTC"
      />,
    );
    expect(screen.getByTestId("keyword-detail-slot-value-position")).toHaveTextContent("#6");
    expect(screen.getByTestId("keyword-detail-retained-best")).toHaveTextContent(
      "Best #3 for the current definition",
    );
    expect(screen.getByTestId("keyword-detail-quality-comparison")).toHaveTextContent(
      "Improved by 3",
    );
    expect(screen.queryByText(/#99|in 30d|versus previous/i)).not.toBeInTheDocument();
    const dateTimes = Array.from(document.querySelectorAll("time")).map((node) => node.dateTime);
    expect(dateTimes).toContain(quality.rankQuality.current?.observedAt);
    expect(dateTimes).toContain(quality.rankQuality.current?.recordedAt);
    expect(dateTimes).toContain(quality.rankQuality.latestAttempt?.recordedAt);
    expect(dateTimes).toContain(quality.best?.observedAt);
    expect(dateTimes).not.toContain("2000-01-01T00:00:00.000Z");
  });

  it("keeps unavailable current separate from the retained rank, URL and historical-definition Best", () => {
    render(
      <KeywordDetailHeaderChrome
        actions={null}
        keyword={detailMetadataFixture()}
        quality={unavailableDetailQuality()}
        timeZone="UTC"
      />,
    );
    expect(screen.getByTestId("keyword-detail-slot-value-position")).toHaveTextContent(
      "Current rank unknown",
    );
    expect(screen.getByTestId("keyword-detail-last-known")).toHaveTextContent("Last known #6");
    expect(screen.getByTestId("keyword-detail-retained-best")).toHaveTextContent(
      "Best #3 for the last known definition",
    );
    expect(screen.getByTestId("keyword-detail-slot-value-ranking-url")).toHaveTextContent(
      "No ranking URL yet",
    );
    const retained = screen.getByTestId("keyword-detail-retained-url");
    expect(retained).toHaveTextContent("Last known URL");
    expect(within(retained).getByRole("link")).toHaveAttribute(
      "href",
      "https://example.com/retained",
    );
    expect(screen.getByTestId("keyword-detail-quality-comparison")).toHaveTextContent(
      "No comparable baseline",
    );
  });

  it("preserves stored unqualified values without treating them as a rank, Best or numeric movement", () => {
    const quality = unavailableDetailQuality();
    const point = quality.rankQuality.current;
    if (!point) throw new Error("Missing fixture point");
    quality.best = null;
    quality.rankQuality.lastKnown = {
      ...quality.rankQuality.lastKnown,
      current: { ...point, reportedPosition: 2, evidence: "unknown", reason: "missing_scope" },
      lastSuccess: null,
    };
    render(
      <KeywordDetailHeaderChrome
        actions={null}
        keyword={detailMetadataFixture()}
        quality={quality}
        timeZone="UTC"
      />,
    );
    expect(screen.getByTestId("keyword-detail-stored-unqualified")).toHaveTextContent(
      "Stored value 2; qualification unavailable",
    );
    expect(screen.queryByText("#2", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByTestId("keyword-detail-retained-best")).not.toBeInTheDocument();
  });

  it("keeps current rank readable while exposing a later failed attempt with its own actual provider/time", () => {
    const quality = detailQualityFixture();
    quality.latestAttemptProvider = "dataforseo";
    quality.rankQuality.latestAttempt = {
      id: "check_failed",
      status: "failed",
      observedAt: null,
      measurementRecordedAt: "2026-10-12T11:00:00.000Z",
      recordedAt: "2026-10-12T10:59:00.000Z",
    };
    quality.rankQuality.event = "unknown";
    quality.rankQuality.movement = null;
    render(
      <KeywordDetailHeaderChrome
        actions={null}
        keyword={detailMetadataFixture()}
        quality={quality}
        timeZone="UTC"
      />,
    );
    expect(screen.getByTestId("keyword-detail-slot-value-position")).toHaveTextContent("#6");
    expect(screen.getByText("Failed", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("via DataForSEO")).toBeInTheDocument();
    expect(screen.getByTestId("keyword-detail-quality-comparison")).toHaveTextContent(
      "Comparison unknown",
    );
  });

  it("shows explicit stale and known-absence evidence with a kernel event and no artificial101 subtraction", () => {
    const quality = detailQualityFixture();
    const point = quality.rankQuality.current;
    if (!point) throw new Error("Missing fixture point");
    quality.rankQuality.current = {
      ...point,
      evidence: "known_absent",
      position: null,
      reportedPosition: null,
      freshness: "stale",
      freshnessReason: null,
    };
    quality.rankQuality.comparison = "unavailable";
    quality.rankQuality.event = "unknown";
    quality.rankQuality.movement = null;
    render(
      <KeywordDetailHeaderChrome
        actions={null}
        keyword={detailMetadataFixture()}
        quality={quality}
        timeZone="UTC"
      />,
    );
    expect(screen.getByTestId("keyword-detail-slot-value-position")).toHaveTextContent(
      "Confirmed absent in qualified scope",
    );
    expect(screen.getByTestId("keyword-detail-qualified-position")).toHaveTextContent("Stale");
    expect(screen.queryByText(/#101|92|Improved by/)).not.toBeInTheDocument();
  });
});
