import type { AuditEntry } from "@/lib/queries/audit";
import { setNavigationState } from "@/tests/next-navigation";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuditLogView } from "./AuditLogView";
import {
  AUDIT_TABLE_DEFAULT_PAGINATION,
  AUDIT_TABLE_DEFAULT_SORT,
  AUDIT_TABLE_DENSITY,
  AUDIT_TABLE_PAGE_SIZE_OPTIONS,
} from "./audit-table-state";

function auditEntry(index: number): AuditEntry {
  const sequence = String(index).padStart(2, "0");
  return {
    actor: {
      email: `auditor-${sequence}@example.com`,
      id: `usr_${sequence}`,
      initials: "AU",
      name: `Auditor ${sequence}`,
    },
    diff: [],
    eventName: `Audit event ${sequence}`,
    eventType: "system",
    id: `audit_${sequence}`,
    metadata: {
      app_version: "1.2.3",
      correlation_id: `corr_${sequence}`,
      event_id: `audit_${sequence}`,
      user_agent: "Example Browser",
    },
    operation: "UPDATE",
    resource: { id: `provider_${sequence}`, name: "Primary provider", type: "provider" },
    source: { channel: "ui", ip: "Not recorded" },
    status: "success",
    timestamp: `2026-09-${sequence}T14:32:00.000Z`,
    timestampLabel: `2026-09-${sequence} 14:32:00 UTC`,
  };
}

function renderAudit(entries: readonly AuditEntry[] = []) {
  return render(
    <AuditLogView
      dateRange="30d"
      entries={entries}
      entryLimit={200}
      retentionDays={365}
      truncated={false}
    />,
  );
}

beforeEach(() => {
  setNavigationState({ pathname: "/app/settings/audit" });
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(614);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(1_000);
});

afterEach(() => vi.restoreAllMocks());

describe("AuditLogView", () => {
  it("embeds the client table in the Card frame and keeps the viewport constrained", () => {
    renderAudit();

    const boundary = screen.getByTestId("audit-grid-scroll-boundary");
    const viewport = screen.getByTestId("audit-grid-viewport");
    const table = screen.getByRole("table", { name: "Audit log" });

    expect(boundary).toHaveClass("min-w-0", "overflow-hidden");
    expect(boundary).not.toHaveClass("overflow-x-auto");
    expect(viewport).toHaveClass("w-full", "min-w-0", "[&>[role=table]]:border-0");
    expect(viewport).not.toHaveClass("min-w-[920px]");
    expect(table).toHaveAttribute("data-layout", "fill");
    expect(table).not.toHaveAttribute("role", "grid");
    expect(screen.getByText("No audit events match")).toBeVisible();
    expect(
      screen.getByText(
        "Adjust the filters to search up to the 200 most recent events in this date range.",
      ),
    ).toBeVisible();
    expect(screen.getByText("Append-only / retained 365 days")).toBeVisible();
  });

  it("uses the preserved client page sizes, timestamp default sort, and resets page on filters", () => {
    renderAudit(Array.from({ length: 11 }, (_, index) => auditEntry(index + 1)));

    const table = screen.getByRole("table", { name: "Audit log" });
    const body = within(screen.getByTestId("audit-log-body"));

    expect(AUDIT_TABLE_DENSITY).toBe("standard");
    expect(AUDIT_TABLE_DEFAULT_PAGINATION).toEqual({ page: 1, pageSize: 10 });
    expect(AUDIT_TABLE_PAGE_SIZE_OPTIONS).toEqual([10, 25, 50]);
    expect(AUDIT_TABLE_DEFAULT_SORT).toEqual({ direction: "desc", field: "timestamp" });
    expect(within(table).getByRole("columnheader", { name: /Timestamp/ })).toHaveAttribute(
      "aria-sort",
      "descending",
    );
    expect(body.getAllByRole("row")[0]).toHaveTextContent("Audit event 11");
    expect(screen.queryByText("Audit event 01")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("Audit event 01")).toBeVisible();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search audit events" }), {
      target: { value: "Audit event 11" },
    });
    expect(screen.getByText("Audit event 11")).toBeVisible();
    expect(screen.queryByText("Audit event 01")).not.toBeInTheDocument();
  }, 10_000);

  it("opens detail from the title-cell keyboard control", async () => {
    renderAudit([auditEntry(1)]);

    const open = screen.getByRole("button", { name: "Open audit event Audit event 01" });
    open.focus();
    await userEvent.keyboard("{Enter}");

    expect(screen.getByRole("button", { name: "Close" })).toBeVisible();
    expect(screen.getByRole("dialog")).toHaveTextContent("Audit event 01");
  });
});
