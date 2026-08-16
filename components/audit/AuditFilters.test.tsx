import {
  CommandRegistryProvider,
  useRegisteredCommands,
} from "@/components/shell/command-registry";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuditFilters } from "./AuditFilters";
import type { AuditExportFormat } from "./audit-export";
import type { AuditFilterState } from "./audit-filtering";

function CommandProbe() {
  const commands = useRegisteredCommands();
  return (
    <ul data-testid="cmd-list">
      {commands.map((c) => (
        <li key={c.id} data-testid={`cmd-${c.id}`}>
          <span data-testid={`label-${c.id}`}>{c.label}</span>
          <span data-testid={`hint-${c.id}`}>{c.hint}</span>
          <button data-testid={`run-${c.id}`} onClick={() => c.run()} type="button">
            Run
          </button>
        </li>
      ))}
    </ul>
  );
}

const baseFilters: AuditFilterState = {
  actor: "all",
  dateRange: "30d",
  eventType: "all",
  search: "",
  status: "all",
};

function renderFilters(
  overrides: { onExport?: (f: AuditExportFormat) => void; visibleCount?: number } = {},
) {
  const onExport = overrides.onExport ?? vi.fn();
  render(
    <CommandRegistryProvider>
      <AuditFilters
        actors={[]}
        eventTypes={[]}
        filters={baseFilters}
        onChange={vi.fn()}
        onExport={onExport}
        totalCount={10}
        truncated={false}
        visibleCount={overrides.visibleCount ?? 5}
      />
      <CommandProbe />
    </CommandRegistryProvider>,
  );
  return { onExport };
}

describe("AuditFilters command registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers Filter and Export with audit scope", () => {
    renderFilters({ visibleCount: 3 });
    expect(screen.getByTestId("cmd-audit-filter")).toBeTruthy();
    expect(screen.getByTestId("cmd-audit-export")).toBeTruthy();
    expect(screen.getByTestId("label-audit-filter").textContent).toBe("Filter");
    expect(screen.getByTestId("hint-audit-filter").textContent).toBe("Search audit events");
    expect(screen.getByTestId("label-audit-export").textContent).toBe("Export");
    expect(screen.getByTestId("hint-audit-export").textContent).toBe("Download CSV");
  });

  it("Filter command focuses the search input", () => {
    renderFilters({ visibleCount: 3 });
    fireEvent.click(screen.getByTestId("run-audit-filter"));
    expect(screen.getByRole("searchbox", { name: "Search audit events" })).toHaveFocus();
  });

  it("Export command calls onExport with csv format", () => {
    const { onExport } = renderFilters({ visibleCount: 3 });
    fireEvent.click(screen.getByTestId("run-audit-export"));
    expect(onExport).toHaveBeenCalledWith("csv");
  });

  it("Export is absent when visibleCount is zero", () => {
    renderFilters({ visibleCount: 0 });
    expect(screen.queryByTestId("cmd-audit-export")).toBeNull();
    expect(screen.getByTestId("cmd-audit-filter")).toBeTruthy();
  });
});
