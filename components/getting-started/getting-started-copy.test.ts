import { describe, expect, it } from "vitest";
import {
  FINISH_SETUP_CTA,
  formatSetupProgressLabel,
  GETTING_STARTED_RAIL_LABEL,
  GETTING_STARTED_SUBTITLE_COMPLETE,
  GETTING_STARTED_SUBTITLE_INCOMPLETE,
  gettingStartedSubtitle,
  SEE_DASHBOARD_CTA,
  SETUP_FINISHED_HEADLINE,
} from "./getting-started-copy";

describe("getting started copy", () => {
  it("describes the open checklist before completion", () => {
    expect(gettingStartedSubtitle(false)).toBe(GETTING_STARTED_SUBTITLE_INCOMPLETE);
    expect(GETTING_STARTED_SUBTITLE_INCOMPLETE).toBe("Four steps to your first positions.");
  });

  it("describes optional follow-up after completion", () => {
    expect(gettingStartedSubtitle(true)).toBe(GETTING_STARTED_SUBTITLE_COMPLETE);
    expect(GETTING_STARTED_SUBTITLE_COMPLETE).toBe("Done. Everything below is optional.");
  });

  it("uses one rail label everywhere", () => {
    expect(GETTING_STARTED_RAIL_LABEL).toBe("Get started");
  });

  it("uses explicit finish and dashboard actions", () => {
    expect(FINISH_SETUP_CTA).toBe("Finish setup");
    expect(SEE_DASHBOARD_CTA).toBe("See the dashboard");
    expect(SETUP_FINISHED_HEADLINE).toBe("Setup finished.");
  });

  it("formats progress counts with of grammar", () => {
    expect(formatSetupProgressLabel(4, 5)).toBe("4 of 5 steps");
  });

  it("names the open checklist from the live step count", () => {
    expect(gettingStartedSubtitle(false, 5)).toBe("Five steps to your first positions.");
  });
});
