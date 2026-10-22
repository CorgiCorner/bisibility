import { renderWithDomainOverviewMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainOverviewResults } from "./DomainOverviewResults";
import { domainOverviewHistoryFixture, domainOverviewReportFixture } from "./fixtures";

const mocks = vi.hoisted(() => ({ download: vi.fn() }));

vi.mock("@/lib/ui/download", () => ({ downloadTextFile: mocks.download }));

const exportName = "Export domain overview summary as CSV";

function renderReport(
  report: typeof domainOverviewReportFixture,
  options?: {
    history?: typeof domainOverviewHistoryFixture | null;
    onLoadHistory?: () => void;
    readOnly?: boolean;
  },
) {
  const onLoadHistory = options?.onLoadHistory ?? vi.fn();
  render(
    <DomainOverviewResults
      history={options?.history ?? null}
      historyError={false}
      historyLoading={false}
      onLoadHistory={onLoadHistory}
      projectRef="prj_1"
      readOnly={options?.readOnly}
      report={report}
      tableError={null}
      tableFetchedCount={{ keywords: 0, pages: 0 }}
      tableHasMore={{ keywords: false, pages: false }}
      tableLoading={null}
    />,
  );
  return onLoadHistory;
}

describe("Domain overview summary export", () => {
  beforeEach(() => vi.clearAllMocks());

  it("disables export when the overview is missing", () => {
    const onLoadHistory = renderReport({
      ...domainOverviewReportFixture,
      overview: null,
      state: "no_data",
    });

    const button = screen.getByRole("button", { name: exportName });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(mocks.download).not.toHaveBeenCalled();
    expect(onLoadHistory).not.toHaveBeenCalled();
  });

  it("exports the page already on screen and does not load history", () => {
    const onLoadHistory = renderReport(domainOverviewReportFixture);

    fireEvent.click(screen.getByRole("button", { name: exportName }));

    expect(onLoadHistory).not.toHaveBeenCalled();
    expect(mocks.download).toHaveBeenCalledWith(
      expect.not.stringContaining("\nhistory,"),
      "domain-overview-example.com-root-2026-08-12.csv",
      "text/csv;charset=utf-8",
    );
  });

  it("includes history that is already loaded without asking for another load", () => {
    const onLoadHistory = renderReport(domainOverviewReportFixture, {
      history: domainOverviewHistoryFixture,
    });

    fireEvent.click(screen.getByRole("button", { name: exportName }));

    expect(onLoadHistory).not.toHaveBeenCalled();
    expect(mocks.download).toHaveBeenCalledWith(
      expect.stringContaining("history,traffic,2025-08-01,34000,etv"),
      "domain-overview-example.com-root-2026-08-12.csv",
      "text/csv;charset=utf-8",
    );
  });

  it("lets a read-only stored view export the overview", () => {
    const onLoadHistory = renderReport(domainOverviewReportFixture, { readOnly: true });

    expect(screen.getByRole("button", { name: exportName })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: exportName }));
    expect(mocks.download).toHaveBeenCalled();
    expect(onLoadHistory).not.toHaveBeenCalled();
  });
});
