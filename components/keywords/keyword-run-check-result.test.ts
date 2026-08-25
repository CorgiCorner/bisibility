import { describe, expect, it } from "vitest";
import {
  keywordRunCheckBlockMessage,
  keywordRunCheckId,
  keywordRunCheckOutcome,
} from "./keyword-run-check-result";

describe("keywordRunCheckOutcome", () => {
  it("treats a completed run as finished", () => {
    expect(keywordRunCheckOutcome({ status: "completed" })).toBe("completed");
  });

  it("treats a queued run as processing", () => {
    expect(keywordRunCheckOutcome({ status: "running" })).toBe("running");
    expect(keywordRunCheckOutcome(undefined)).toBe("running");
  });

  it("blocks budget and in-progress rejections", () => {
    expect(
      keywordRunCheckOutcome({
        code: "budget_exhausted",
        message: "Rank check monthly budget reached.",
        status: "not_started",
      }),
    ).toBe("blocked");
    expect(
      keywordRunCheckOutcome({
        code: "check_in_progress",
        message: "A rank check is already queued or running.",
        status: "not_started",
      }),
    ).toBe("blocked");
  });

  it("treats a running result with a rankCheckId as running", () => {
    expect(keywordRunCheckOutcome({ rankCheckId: "check_abc", status: "running" })).toBe("running");
  });

  it("treats a completed result with a rankCheckId as completed", () => {
    expect(keywordRunCheckOutcome({ rankCheckId: "check_abc", status: "completed" })).toBe(
      "completed",
    );
  });
});

describe("keywordRunCheckBlockMessage", () => {
  it("prefers the action message", () => {
    expect(
      keywordRunCheckBlockMessage(
        { code: "check_in_progress", message: "Already running." },
        "fallback",
      ),
    ).toBe("Already running.");
  });

  it("falls back when the result has no message", () => {
    expect(keywordRunCheckBlockMessage({ status: "not_started" }, "Could not start.")).toBe(
      "Could not start.",
    );
  });
});

describe("keywordRunCheckId", () => {
  it("returns the public check id from a running result", () => {
    expect(keywordRunCheckId({ rankCheckId: "check_abc", status: "running" })).toBe("check_abc");
  });

  it("returns the public check id from a completed result", () => {
    expect(keywordRunCheckId({ rankCheckId: "check_abc", status: "completed" })).toBe("check_abc");
  });

  it("returns null for a blocked result without a rankCheckId", () => {
    expect(keywordRunCheckId({ code: "budget_exhausted", status: "not_started" })).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(keywordRunCheckId(undefined)).toBeNull();
  });

  it("returns null when rankCheckId is not a string", () => {
    expect(keywordRunCheckId({ rankCheckId: 123, status: "running" })).toBeNull();
  });
});
