import { renderWithAuditMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { AuditEntry } from "@/lib/queries/audit";
import { setNavigationState } from "@/tests/next-navigation";
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuditLogView } from "./AuditLogView";
import {
  AUDIT_TABLE_DEFAULT_PAGINATION,
  AUDIT_TABLE_DEFAULT_SORT,
  AUDIT_TABLE_DENSITY,
  AUDIT_TABLE_PAGE_SIZE_OPTIONS,
} from "./audit-table-state";

const mocks = vi.hoisted(() => ({ downloadAuditEntries: vi.fn() }));

vi.mock("./audit-export", () => ({ downloadAuditEntries: mocks.downloadAuditEntries }));

function auditEntry(index: number): AuditEntry {
  const sequence = String(index).padStart(2, "0");
  return {
    action: `test.${sequence}`,
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
      dateDisplay={{ dateFormat: "day_first", locale: "en", timeZone: "UTC" }}
      dateRange="30d"
      entries={entries}
      entryLimit={200}
      retentionDays={365}
      truncated={false}
    />,
  );
}

beforeEach(() => {
  mocks.downloadAuditEntries.mockClear();
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
    expect(viewport).toHaveClass("w-full", "min-w-0");
    expect(table).toHaveAttribute("data-bordered", "false");
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
    expect(body.getAllByRole("row")[0]).toHaveTextContent("Recorded action: test.11");
    expect(screen.queryByText("Recorded action: test.01")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("Recorded action: test.01")).toBeVisible();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search audit events" }), {
      target: { value: "test.11" },
    });
    expect(screen.getByText("Recorded action: test.11")).toBeVisible();
    expect(screen.queryByText("Recorded action: test.01")).not.toBeInTheDocument();
  }, 10_000);

  it("opens detail from the title-cell keyboard control", async () => {
    renderAudit([auditEntry(1)]);

    const open = screen.getByRole("button", { name: "Open audit event Recorded action: test.01" });
    open.focus();
    await userEvent.keyboard("{Enter}");

    expect(screen.getByRole("button", { name: "Close" })).toBeVisible();
    expect(screen.getByRole("dialog")).toHaveTextContent("Recorded action: test.01");
  });

  it("exports the selected raw records instead of their localized presentation", () => {
    const raw = {
      ...auditEntry(1),
      actor: { ...auditEntry(1).actor, email: "", name: null },
      eventName: undefined,
      metadata: {
        app_version: null,
        correlation_id: null,
        event_id: "audit_01",
        user_agent: null,
      },
      source: { channel: "api" as const, ip: null },
      timestampLabel: undefined,
    } satisfies AuditEntry;
    renderAudit([raw]);

    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    fireEvent.click(screen.getByText("CSV"));

    expect(mocks.downloadAuditEntries).toHaveBeenCalledWith([raw], "csv");
  });
});
