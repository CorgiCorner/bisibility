import { type AnalyticsEvent, setPersonProperties, track } from "@/lib/analytics/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("analytics client", () => {
  beforeEach(() => {
    window.bisibilityAnalyticsQueue = undefined;
    window.bisibilityAnalytics = undefined;
  });

  it("creates the queue when missing and enqueues an event", () => {
    track("search_insights_module_viewed", {});

    expect(window.bisibilityAnalyticsQueue).toHaveLength(1);
    expect(window.bisibilityAnalyticsQueue?.[0]).toMatchObject({
      event: "search_insights_module_viewed",
      props: {},
    });
  });

  it("calls a present sink with the event and props and does not queue", () => {
    const sink = { track: vi.fn() };
    window.bisibilityAnalytics = sink;

    track("search_insights_period_changed", { window: "90" });

    expect(sink.track).toHaveBeenCalledWith("search_insights_period_changed", {
      window: "90",
    });
    expect(window.bisibilityAnalyticsQueue).toBeUndefined();
  });

  it("appends to an existing queue without resetting it", () => {
    track("search_insights_chip_opened", { which: "band" });
    track("search_insights_chip_opened", { which: "overlap" });

    expect(window.bisibilityAnalyticsQueue).toHaveLength(2);
  });

  it("forwards neutral quiz person properties only when a sink is installed", () => {
    const sink = { setPersonProperties: vi.fn(), track: vi.fn() };
    window.bisibilityAnalytics = sink;

    setPersonProperties({ quiz_role: "founder", quiz_targets: ["seo", "reporting"] });

    expect(sink.setPersonProperties).toHaveBeenCalledWith({
      quiz_role: "founder",
      quiz_targets: ["seo", "reporting"],
    });
  });

  it("routes every event through the sink and never creates a queue once the sink is installed", () => {
    const sink = { track: vi.fn() };
    window.bisibilityAnalytics = sink;

    track("search_insights_drawer_pivot", { from: "band", to: "query" });
    track("search_insights_track_clicked", { source: "drawer" });

    expect(sink.track).toHaveBeenCalledTimes(2);
    expect(window.bisibilityAnalyticsQueue).toBeUndefined();
  });

  it("pins all existing and new typed event names", () => {
    const events = [
      "getting_started_cta_clicked",
      "onboarding_step_skipped",
      "search_insights_chip_opened",
      "search_insights_comparison_changed",
      "search_insights_csv_exported",
      "search_insights_drawer_pivot",
      "search_insights_module_viewed",
      "search_insights_period_changed",
      "search_insights_track_clicked",
      "setup_video_opened",
      "ui_option_selected",
    ] as const satisfies readonly AnalyticsEvent[];

    for (const event of events) {
      track(event, {});
    }
    expect(window.bisibilityAnalyticsQueue).toHaveLength(events.length);
  });
});
