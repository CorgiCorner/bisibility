import { afterEach, describe, expect, it, vi } from "vitest";
import { alertsEmailFrom, configuredEmailFrom, requireEmailFrom } from "./from";

function clearFromEnv() {
  vi.stubEnv("EMAIL_FROM", "");
  vi.stubEnv("EMAIL_ALERTS_FROM", "");
}

describe("email sender helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads the sender from EMAIL_FROM", () => {
    clearFromEnv();
    vi.stubEnv("EMAIL_FROM", "bisibility <hello@example.com>");

    expect(configuredEmailFrom()).toBe("bisibility <hello@example.com>");
  });

  it("ignores retired Resend sender variables", () => {
    clearFromEnv();
    vi.stubEnv("RESEND_FROM_EMAIL", "bisibility <legacy@example.com>");
    vi.stubEnv("RESEND_FROM", "bisibility <legacy@example.com>");

    expect(configuredEmailFrom()).toBeNull();
  });

  it("treats blank senders as unconfigured", () => {
    clearFromEnv();
    vi.stubEnv("EMAIL_FROM", "   ");

    expect(configuredEmailFrom()).toBeNull();
  });

  it("requires a sender with an actionable message", () => {
    clearFromEnv();

    expect(() => requireEmailFrom()).toThrow("EMAIL_FROM is required to send email.");
  });

  it("prefers the dedicated alerts sender", () => {
    clearFromEnv();
    vi.stubEnv("EMAIL_FROM", "bisibility <hello@example.com>");
    vi.stubEnv("EMAIL_ALERTS_FROM", "bisibility alerts <alerts@example.com>");

    expect(alertsEmailFrom()).toBe("bisibility alerts <alerts@example.com>");
  });

  it("falls back to the default sender when no alerts sender is set", () => {
    clearFromEnv();
    vi.stubEnv("EMAIL_FROM", "bisibility <hello@example.com>");
    vi.stubEnv("RESEND_ALERTS_FROM", "bisibility alerts <legacy-alerts@example.com>");

    expect(alertsEmailFrom()).toBe("bisibility <hello@example.com>");
  });
});
