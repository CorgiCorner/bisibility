import type { LoadDomainHistoryAction } from "@/lib/actions/domain-overview";
import type { DomainOverviewReport } from "@/lib/domain-overview/types";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  domainOverviewHistoryFixture,
  domainOverviewMarketFixture,
  domainOverviewReportFixture,
} from "./fixtures";
import { useDomainOverviewHistory } from "./useDomainOverviewHistory";

type HistoryOutcome = Awaited<ReturnType<LoadDomainHistoryAction>>;

const domainOverviewHistoryRow = domainOverviewHistoryFixture[0];

if (!domainOverviewHistoryRow) {
  throw new Error("Domain overview history fixture must include one row");
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function report(target: string): DomainOverviewReport {
  return { ...domainOverviewReportFixture, target };
}

function historyResult(count: number, costCents: number): Extract<HistoryOutcome, { ok: true }> {
  return {
    cached: false,
    costCents,
    data: [
      {
        ...domainOverviewHistoryRow,
        metrics: { ...domainOverviewHistoryRow.metrics, count },
      },
    ],
    fetchedAt: "2026-08-13T01:00:00.000Z",
    ok: true,
  };
}

function renderHistoryHook(
  report: DomainOverviewReport,
  loadHistoryAction: LoadDomainHistoryAction,
) {
  const addSpend = vi.fn<(costCents: number) => void>();
  const hook = renderHook(
    ({ report }: { report: DomainOverviewReport }) =>
      useDomainOverviewHistory({
        activeMarket: domainOverviewMarketFixture,
        addSpend,
        estimate: {
          cached: false,
          costCents: 4,
          freshCostCents: 6,
          historyCostCents: 12,
          keywordPageCostCents: 2,
          loading: false,
          pagePageCostCents: 3,
          valid: true,
        },
        loadHistoryAction,
        projectId: "prj_1",
        report,
      }),
    { initialProps: { report } },
  );
  return { ...hook, addSpend };
}

describe("useDomainOverviewHistory", () => {
  it("clears loading when reset invalidates a pending history request", async () => {
    const pending = deferred<HistoryOutcome>();
    const loadHistoryAction = vi.fn<LoadDomainHistoryAction>().mockReturnValueOnce(pending.promise);
    const { result } = renderHistoryHook(report("example.com"), loadHistoryAction);

    let load = Promise.resolve();
    act(() => {
      load = result.current.loadHistory();
    });
    expect(result.current.historyLoading).toBe(true);

    act(() => {
      result.current.resetHistory();
    });
    expect(result.current.historyLoading).toBe(false);

    await act(async () => {
      pending.resolve(historyResult(10, 7));
      await load;
    });
    expect(result.current.history).toBeNull();
  });

  it("does not let a late report history response overwrite the active report", async () => {
    const first = deferred<HistoryOutcome>();
    const second = deferred<HistoryOutcome>();
    const loadHistoryAction = vi
      .fn<LoadDomainHistoryAction>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { addSpend, result, rerender } = renderHistoryHook(
      report("first.example.com"),
      loadHistoryAction,
    );

    let firstLoad = Promise.resolve();
    act(() => {
      firstLoad = result.current.loadHistory();
    });
    expect(loadHistoryAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ target: "first.example.com" }),
    );

    rerender({ report: report("second.example.com") });
    let secondLoad = Promise.resolve();
    act(() => {
      secondLoad = result.current.loadHistory();
    });
    expect(loadHistoryAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ target: "second.example.com" }),
    );

    await act(async () => {
      first.resolve(historyResult(10, 7));
      await firstLoad;
    });

    expect(addSpend).toHaveBeenCalledWith(7);
    expect(result.current.history).toBeNull();
    expect(result.current.historyError).toBe(false);
    expect(result.current.historyLoading).toBe(true);

    await act(async () => {
      second.resolve(historyResult(20, 9));
      await secondLoad;
    });

    expect(addSpend).toHaveBeenCalledWith(9);
    expect(result.current.history?.data[0]?.metrics.count).toBe(20);
    expect(result.current.historyError).toBe(false);
    expect(result.current.historyLoading).toBe(false);
  });
});
