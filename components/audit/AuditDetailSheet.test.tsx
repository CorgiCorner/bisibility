import type { AuditEntry } from "@/lib/queries/audit";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuditDetailSheet } from "./AuditDetailSheet";

const entry: AuditEntry = {
  actor: { email: "auditor@example.com", id: "user_1", initials: "AU", name: "Auditor" },
  diff: [],
  eventName: "Provider test",
  eventType: "system",
  id: "audit_1",
  metadata: {
    app_version: "Not recorded",
    correlation_id: "corr_1",
    event_id: "audit_1",
    user_agent: "Not recorded",
  },
  operation: "UPDATE",
  resource: { id: "provider_1", name: "provider_1", type: "provider" },
  source: { channel: "ui", ip: "Not recorded" },
  status: "success",
  timestamp: "2026-07-16T14:32:00.000Z",
  timestampLabel: "2026-07-16 14:32:00 UTC",
};

describe("AuditDetailSheet", () => {
  it("hides empty diffs and copy controls for unrecorded metadata", () => {
    render(<AuditDetailSheet entry={entry} onClose={vi.fn()} />);

    expect(screen.queryByText(/before -> after/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy IP" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy user agent" })).not.toBeInTheDocument();
  });

  it("keeps both sides of an update and exposes the complete user agent", () => {
    const userAgent = "Mozilla/5.0 Example Browser/123.0";
    render(
      <AuditDetailSheet
        entry={{
          ...entry,
          diff: [{ after: "Renamed", before: "Original", field: "name" }],
          metadata: { ...entry.metadata, user_agent: userAgent },
          source: { ...entry.source, ip: "203.0.113.0" },
          status: "failed",
          statusReason: "Provider unavailable",
        }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/name: Original/)).toBeVisible();
    expect(screen.getByText(/name: Renamed/)).toBeVisible();
    expect(screen.getByText(userAgent)).toBeVisible();
    expect(screen.getByRole("button", { name: "Copy IP" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Copy user agent" })).toBeVisible();
    expect(screen.getByText("Provider unavailable")).toBeVisible();
  });
});
