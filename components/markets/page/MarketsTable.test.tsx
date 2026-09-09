import type { MarketsPageRow } from "@/lib/markets/page-model";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MarketsTable } from "./MarketsTable";

const market = {
  activeKeywordCount: 2,
  canonicalKey: "ES@es",
  countryCode: "ES",
  currentVisibility: 50,
  displayName: "Malaga",
  futureKeywordDevices: ["desktop", "mobile"] as ("desktop" | "mobile")[],
  id: "pmkt_abcdefghijklmnopqrstuvwx",
  keywordCount: 2,
  languageLabel: "Spanish",
  locationId: "location_1",
  monthlyCostCents: 515,
  name: "Malaga core",
  status: "active" as const,
  topThreeCount: 1,
} satisfies MarketsPageRow;

function deferred<T>() {
  let reject!: (error: Error) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

function renderTable(
  onStatusChange: ReturnType<typeof vi.fn>,
  onStatusConfirmed = vi.fn(),
  rows: MarketsPageRow[] = [market],
) {
  return render(
    <MarketsTable
      canAddKeywords
      canArchive
      canEdit
      onArchive={vi.fn()}
      onEdit={vi.fn()}
      onStatusConfirmed={onStatusConfirmed}
      onStatusChange={
        onStatusChange as (input: {
          enabled: boolean;
          marketId: string;
        }) => Promise<{ status: string }>
      }
      projectId="prj_abcdefghijklmnopqrstuvwx"
      rows={rows}
      title="Active markets"
    />,
  );
}

describe("MarketsTable status queue", () => {
  it("shows an empty state in an unbordered table when all markets are paused", () => {
    renderTable(vi.fn(), vi.fn(), []);
    expect(screen.getByRole("heading", { name: "No active markets" })).toBeVisible();
    expect(screen.getByRole("table")).toHaveClass("border-0");
    expect(screen.getByRole("table")).not.toHaveClass("border");
  });

  it("renders a bare status toggle without a second control border", () => {
    renderTable(vi.fn());
    expect(screen.getByRole("switch").closest("label")).toHaveClass("border-0", "p-0");
  });

  it("renders markets through the shared data table", () => {
    renderTable(vi.fn());

    expect(screen.getByTestId("markets-table")).toHaveAttribute("role", "table");
  });

  it("serializes two changes and retains the newest confirmed status", async () => {
    const first = deferred<{ status: string }>();
    const second = deferred<{ status: string }>();
    const onStatusChange = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const onStatusConfirmed = vi.fn();
    renderTable(onStatusChange, onStatusConfirmed);

    fireEvent.click(screen.getByRole("switch", { name: "Pause Malaga core" }));
    await waitFor(() => expect(onStatusChange).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("switch", { name: "Resume Malaga core" }));
    expect(onStatusChange).toHaveBeenCalledTimes(1);

    first.resolve({ status: "paused" });
    await waitFor(() => expect(onStatusChange).toHaveBeenCalledTimes(2));
    second.resolve({ status: "active" });

    await waitFor(() =>
      expect(screen.getByRole("switch", { name: "Pause Malaga core" })).toBeChecked(),
    );
    expect(onStatusConfirmed).toHaveBeenCalledOnce();
  });

  it("rolls back to the confirmed state and drops queued intent after a failure", async () => {
    const first = deferred<{ status: string }>();
    const onStatusChange = vi.fn().mockReturnValue(first.promise);
    renderTable(onStatusChange);

    fireEvent.click(screen.getByRole("switch", { name: "Pause Malaga core" }));
    await waitFor(() => expect(onStatusChange).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("switch", { name: "Resume Malaga core" }));
    first.reject(new Error("network"));

    await waitFor(() => expect(screen.getByText("network")).toBeInTheDocument());
    expect(onStatusChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("switch", { name: "Pause Malaga core" })).toBeChecked();
  });

  it("sorts tied names by public ID and renders unavailable rollups as dashes", () => {
    const tiedRows: MarketsPageRow[] = [
      { ...market, id: "pmkt_ccdefghijklmnopqrstuvwx", name: "Alpha" },
      {
        ...market,
        currentVisibility: null,
        id: "pmkt_bbcdefghijklmnopqrstuvwx",
        monthlyCostCents: null,
        name: "Alpha",
        topThreeCount: null,
      },
    ];
    renderTable(vi.fn(), vi.fn(), tiedRows);

    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(["Alpha", "Alpha"]);
    expect(screen.getAllByRole("link")[0]).toHaveAttribute(
      "href",
      "/app/prj_abcdefghijklmnopqrstuvwx/m/pmkt_bbcdefghijklmnopqrstuvwx/rank-tracker",
    );
    expect(screen.getAllByText("-")).toHaveLength(3);
  });
});
