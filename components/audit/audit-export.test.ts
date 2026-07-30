import type { AuditEntry } from "@/lib/queries/audit";
import { describe, expect, it } from "vitest";
import { auditEntriesToCsv } from "./audit-export";

const entry: AuditEntry = {
  actor: {
    email: "auditor@example.com",
    id: "usr_abcdefghijklmnopqrstuvwx",
    initials: "AU",
    name: "Auditor",
  },
  diff: [],
  eventName: "Provider test",
  eventType: "system",
  id: "audit_abcdefghijklmnopqrstuvwx",
  metadata: {
    app_version: "1.2.3",
    correlation_id: "corr_1",
    event_id: "audit_abcdefghijklmnopqrstuvwx",
    user_agent: 'Browser, "Example"',
  },
  operation: "UPDATE",
  resource: {
    id: "conn_abcdefghijklmnopqrstuvwx",
    name: "conn_abcdefghijklmnopqrstuvwx",
    type: "provider",
  },
  source: { channel: "ui", ip: "203.0.113.0" },
  status: "failed",
  statusReason: "Provider unavailable",
  timestamp: "2026-07-16T14:32:00.000Z",
  timestampLabel: "2026-07-16 14:32:00 UTC",
};

describe("auditEntriesToCsv", () => {
  it("appends source and failure evidence columns", () => {
    const csv = auditEntriesToCsv([entry]);
    const [headers, row] = csv.split("\n");

    expect(headers).toBe(
      "timestamp,actor_email,event,resource_type,resource_id,operation,status,event_id,correlation_id,source_ip,user_agent,app_version,status_reason",
    );
    expect(row).toContain("203.0.113.0");
    expect(row).toContain('"Browser, ""Example"""');
    expect(row).toContain("1.2.3,Provider unavailable");
  });
});
