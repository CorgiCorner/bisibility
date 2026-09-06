import { describe, expect, it } from "vitest";
import {
  ALL_STEPS_COMPLETE,
  FINISH_SETUP_CTA,
  FINISH_SETUP_HELPER,
  formatSetupProgressLabel,
  GETTING_STARTED_LABEL,
  GETTING_STARTED_SUBTITLE_COMPLETE,
  GETTING_STARTED_SUBTITLE_INCOMPLETE,
  gettingStartedSubtitle,
  WHATS_NEXT_HEADING,
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

  it("uses one getting started label everywhere", () => {
    expect(GETTING_STARTED_LABEL).toBe("Get set up");
  });

  it("uses an explicit finish action", () => {
    expect(FINISH_SETUP_CTA).toBe("Mark setup as complete");
    expect(FINISH_SETUP_HELPER).toBe(
      "Your first rankings are ready. Mark setup as complete to remove this guide from the sidebar.",
    );
    expect(ALL_STEPS_COMPLETE).toBe("All steps are complete");
    expect(WHATS_NEXT_HEADING).toBe("What's next?");
  });

  it("formats progress counts with of grammar", () => {
    expect(formatSetupProgressLabel(4, 5)).toBe("4 of 5 steps");
  });

  it("names the open checklist from the live step count", () => {
    expect(gettingStartedSubtitle(false, 5)).toBe("Five steps to your first positions.");
  });
});
