import { describe, expect, it } from "vitest";
import { sessionActivityKind } from "./request";

describe("session activity classification", () => {
  it("marks an app GET seen but not acted", () => {
    expect(sessionActivityKind("/app/projects", "GET", null)).toBe("seen");
  });
  it("marks actions and session mutations acted", () => {
    expect(sessionActivityKind("/app/projects", "POST", "action-id")).toBe("acted");
    expect(sessionActivityKind("/api/projects", "PATCH", null)).toBe("acted");
  });
  it("excludes background, refresh and telemetry routes", () => {
    for (const path of [
      "/api/cron/run",
      "/api/auth/get-session",
      "/api/telemetry",
      "/api/webhooks/x",
      "/api/ingest/x",
      "/api/private/billing/attribution/",
    ]) {
      expect(sessionActivityKind(path, "POST", null)).toBeNull();
    }
    expect(sessionActivityKind(null, null, null)).toBeNull();
  });
});
