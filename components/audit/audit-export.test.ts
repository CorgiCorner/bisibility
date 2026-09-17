import type { AuditEntry } from "@/lib/queries/audit";
import projectAuditMessages from "@/messages/core/en/project-audit.json";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { auditEntriesToCsv, auditEntriesToJson } from "./audit-export";
import { presentAuditEntry } from "./audit-presentation";

const entry: AuditEntry = {
  action: "provider.test",
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

  it("keeps the established event-name export column rather than its presentation source code", () => {
    const [, row] = auditEntriesToCsv([entry]).split("\n");

    expect(row).toContain(",Provider test,");
    expect(row).not.toContain(",provider.test,");
  });

  it("keeps system and missing values stable when a document presents the row in another locale", () => {
    const raw: AuditEntry = {
      ...entry,
      actor: { ...entry.actor, email: "", initials: "U", name: null },
      eventName: undefined,
      metadata: {
        app_version: null,
        correlation_id: null,
        event_id: entry.metadata.event_id,
        user_agent: null,
      },
      resource: { ...entry.resource, name: null },
      source: { channel: "api", ip: null },
      timestampLabel: undefined,
    };
    const messages = structuredClone(projectAuditMessages);
    messages.projectAudit.presentation.actorSystem = "System PL";
    messages.projectAudit.presentation.event.providerTested = "Test dostawcy";
    const t = createTranslator({
      locale: "pl",
      messages,
      namespace: "projectAudit.presentation",
    });

    expect(
      presentAuditEntry(raw, { dateFormat: "day_first", locale: "pl", timeZone: "UTC" }, t),
    ).toMatchObject({ actor: { name: "System PL" }, eventName: "Test dostawcy" });

    const [exported] = JSON.parse(auditEntriesToJson([raw])) as AuditEntry[];
    expect(exported).toMatchObject({
      actor: { email: "system@bisibility", initials: "S", name: "System" },
      eventName: "Provider test",
      metadata: {
        app_version: "Not recorded",
        correlation_id: "Not recorded",
        user_agent: "Not recorded",
      },
      resource: { name: "Resource unavailable" },
      source: { ip: "Not recorded" },
    });
    expect(exported).not.toHaveProperty("hasRecordedIp");
    expect(exported).not.toHaveProperty("hasRecordedUserAgent");
  });
});
