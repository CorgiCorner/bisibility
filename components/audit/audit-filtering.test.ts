import { describe, expect, it } from "vitest";
import { actorOptions, applyAuditFilters, eventTypeOptions } from "./audit-filtering";

describe("audit filtering", () => {
  it("filters audit rows and deduplicates option values", () => {
    const rows = [
      {
        actor: { email: "a@example.com", id: "1", name: "Alice" },
        eventName: "Login",
        eventType: "auth",
        metadata: {},
        operation: "login",
        resource: { id: "r", name: "App", type: "app" },
        status: "success",
      },
      {
        actor: { email: "a@example.com", id: "1", name: "Alice" },
        eventName: "Export",
        eventType: "export",
        metadata: {},
        operation: "export",
        resource: { id: "r", name: "Data", type: "file" },
        status: "failed",
      },
    ] as never;
    expect(
      applyAuditFilters(rows, {
        actor: "all",
        dateRange: "30d",
        eventType: "all",
        search: "data",
        status: "failed",
      }),
    ).toHaveLength(1);
    expect(actorOptions(rows)).toHaveLength(1);
    expect(eventTypeOptions(rows)).toEqual(["auth", "export"]);
  });
});
