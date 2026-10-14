import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { PositionHistoryCard } from "@/components/keywords/PositionHistoryCard";
import { RankingUrlHistory } from "@/components/keywords/RankingUrlHistory";
import { RetrievedResultsCard } from "@/components/keywords/RetrievedResultsCard";
import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  fixtureHistoryPort,
  historyPages,
  observation,
  pagedHistory,
  snapshot,
} from "./history.test-fixture";
import { KeywordDetailHistory } from "./KeywordDetailHistory";
import { RetainedSnapshotCard } from "./RetainedSnapshotCard";

describe("keyword full retained history UI", () => {
  it("does not fetch or perform provider work on mount or on switching already loaded streams", () => {
    const port = fixtureHistoryPort();
    port.readPage = vi.fn(port.readPage);
    port.readWindow = vi.fn(port.readWindow);
    port.readSnapshot = vi.fn(port.readSnapshot);
    render(<KeywordDetailHistory history={port} keyword="Stored target" timeZone="UTC" />);
    const table = screen.getByRole("table", { name: "Recorded observations" });
    expect(table.closest(".rounded-card")?.parentElement).toHaveClass("grid-cols-1", "min-w-0");
    expect(screen.getByRole("button", { name: "History date window" })).toHaveClass(
      "min-w-0",
      "max-w-full",
    );
    fireEvent.click(screen.getByRole("radio", { name: "Attempts" }));
    expect(screen.getByRole("table", { name: "Recorded logical attempts" })).toBeInTheDocument();
    expect(port.readPage).not.toHaveBeenCalled();
    expect(port.readWindow).not.toHaveBeenCalled();
    expect(port.readSnapshot).not.toHaveBeenCalled();
  });

  it("reads beyond240 attempts and observations without changing the whole-window count", async () => {
    const { first, rest } = pagedHistory();
    const port = fixtureHistoryPort(first);
    port.readPage = vi.fn(async ({ stream }: Parameters<typeof port.readPage>[0]) => ({
      ok: true as const,
      value: rest[stream],
    }));
    render(<KeywordDetailHistory history={port} keyword="Stored target" timeZone="UTC" />);
    fireEvent.click(screen.getByRole("button", { name: "Load more history" }));
    await waitFor(
      () =>
        expect(
          screen
            .getByRole("table", { name: "Recorded observations" })
            .querySelectorAll('[data-testid$="-body"] > [role="row"]'),
        ).toHaveLength(320),
      { timeout: 30_000 },
    );
    expect(screen.getAllByText("320 of 320 records loaded")).not.toHaveLength(0);
    fireEvent.click(screen.getByRole("radio", { name: "Attempts" }));
    fireEvent.click(screen.getByRole("button", { name: "Load more history" }));
    await waitFor(
      () =>
        expect(
          screen
            .getByRole("table", { name: "Recorded logical attempts" })
            .querySelectorAll('[data-testid$="-body"] > [role="row"]'),
        ).toHaveLength(320),
      { timeout: 30_000 },
    );
    expect(port.readPage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ stream: "observations", cursor: "observations-next" }),
    );
    expect(port.readPage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        stream: "attempts",
        cursor: "attempts-next",
        window: expect.objectContaining({ basis: "recorded_at" }),
      }),
    );
  }, 60_000);

  it("refuses a changed source on the next page and preserves the old snapshot without partial replacement", async () => {
    const { first, rest } = pagedHistory();
    const port = fixtureHistoryPort(first);
    port.readPage = async () => ({
      ok: true,
      value: { ...rest.observations, sourceDigest: "changed" },
    });
    render(<KeywordDetailHistory history={port} keyword="Stored target" timeZone="UTC" />);
    fireEvent.click(screen.getByRole("button", { name: "Load more history" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Saved data changed. Reload history to start a new snapshot.",
    );
    expect(
      screen
        .getByRole("table", { name: "Recorded observations" })
        .querySelectorAll('[data-testid$="-body"] > [role="row"]'),
    ).toHaveLength(250);
    expect(screen.getByRole("button", { name: "Reload history" })).toBeInTheDocument();
  }, 30_000);

  it("opens only the clicked saved check and keeps its normalized position when raw detail expired", async () => {
    const port = fixtureHistoryPort();
    port.readSnapshot = vi.fn(port.readSnapshot);
    render(<PositionHistoryCard history={port} keyword={keywordRows[0]} timeZone="UTC" />);
    const table = screen.getByRole("table", { name: "Recorded observations" });
    const id = port.initial.observations.records[0]?.id;
    if (!id) throw new Error("Fixture requires an observation");
    fireEvent.click(within(table).getByRole("button", { name: `Open saved observation ${id}` }));
    const retained = await screen.findByTestId("retained-history-snapshot");
    expect(port.readSnapshot).toHaveBeenCalledWith({
      asOf: port.initial.observations.asOf,
      checkId: id,
    });
    expect(within(retained).getByText("#6")).toBeInTheDocument();
    expect(
      within(retained).getByText("Raw detail expired; normalized observations remain available."),
    ).toBeInTheDocument();
    expect(within(retained).getByText("Feature presence unavailable")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Run check|Extend snapshot/ }),
    ).not.toBeInTheDocument();
  });

  it("hides loaded history and snapshots after an explicit forbidden read outcome", async () => {
    const { first } = pagedHistory();
    const port = fixtureHistoryPort(first);
    port.readPage = async () => ({ ok: false, reason: "forbidden" });
    render(<KeywordDetailHistory history={port} keyword="Sensitive target" timeZone="UTC" />);
    fireEvent.click(screen.getByRole("button", { name: "Load more history" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("History access is unavailable.");
    expect(screen.queryByRole("table", { name: "Recorded observations" })).not.toBeInTheDocument();
    expect(screen.queryByText("Sensitive target")).not.toBeInTheDocument();
  }, 30_000);

  it("does not substitute today's target URL for a historical per-check expectation", () => {
    const page = historyPages().observations;
    render(
      <RankingUrlHistory
        keyword={{ ...keywordRows[0], targetUrl: "https://example.com/today" }}
        history={page}
        timeZone="UTC"
      />,
    );
    const table = screen.getByRole("table", { name: "Per-check recorded URLs" });
    expect(within(table).getAllByText("https://example.com/old-target")).toHaveLength(3);
    expect(within(table).queryByText("https://example.com/today")).not.toBeInTheDocument();
  });

  it("refuses a selected snapshot from a foreign project rather than showing its normalized items", () => {
    const page = historyPages().observations;
    const record = page.records[0];
    if (!record) throw new Error("Fixture requires an observation");
    render(
      <RetrievedResultsCard
        history={{ page, snapshot: { ...snapshot(record), projectId: "prj_foreign" } }}
        timeZone="UTC"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Saved data changed.");
    expect(screen.queryByTestId("retained-history-snapshot")).not.toBeInTheDocument();
  });

  it("preserves legacy stored values with missing methodology as explicitly unqualified", () => {
    render(
      <RetainedSnapshotCard
        snapshot={snapshot(
          observation(0, {
            evidence: "unknown",
            position: null,
            reportedPosition: 2,
            configuredScope: null,
            effectiveScope: null,
            normalizationVersion: null,
            comparisonDigest: null,
            reason: "missing_scope",
          }),
        )}
        timeZone="UTC"
      />,
    );
    expect(screen.getByText("Qualification unknown")).toBeInTheDocument();
    expect(screen.getByText("Stored value 2; qualification unavailable")).toBeInTheDocument();
    expect(screen.queryByText("#2")).not.toBeInTheDocument();
  });
});
