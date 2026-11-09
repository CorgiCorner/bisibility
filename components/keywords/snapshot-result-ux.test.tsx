import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { mergeSnapshotPage } from "@/lib/serp/snapshot-extension";
import { fireEvent, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { RetrievedResultsLadder } from "./RetrievedResultsLadder";
import { RetrievedResultsOneCheck } from "./RetrievedResultsOneCheck";
import { fullResults } from "./retrieved-results-test-fixtures";
import { SnapshotExtensionResults } from "./SnapshotExtensionResults";

it("renders one rank per row and a missing slot inline, with a precise small-gap note", () => {
  const results = fullResults({ requestedDepth: 20, retrievedPositions: 20, trackedPosition: 3 });
  results.rows = results.rows.filter((row) => row.position <= 20 && row.position !== 10);
  render(
    <RetrievedResultsOneCheck
      results={results}
      rankingUrl={null}
      retentionDays={null}
      formatDate={(date) => date}
    />,
  );
  expect(screen.getByText("#10 not returned by the provider")).toBeVisible();
  expect(
    screen.getByRole("button", { name: /1 of 20 positions was not returned: #10/ }),
  ).toBeVisible();
  expect(screen.queryByRole("button", { name: /Missing competitors may still rank/ })).toBeNull();
  expect(within(screen.getByLabelText("Retrieved results")).queryByRole("list")).toHaveProperty(
    "tagName",
    "UL",
  );
});
it("retains the stronger warning for a gap above the tracked result", () => {
  const results = fullResults({ requestedDepth: 20, retrievedPositions: 20, trackedPosition: 20 });
  results.rows = results.rows.filter((row) => row.position <= 20 && row.position !== 10);
  render(
    <RetrievedResultsOneCheck
      results={results}
      rankingUrl={null}
      retentionDays={null}
      formatDate={(date) => date}
    />,
  );
  expect(
    screen.getByRole("button", { name: /Missing competitors may still rank in the Top 20/ }),
  ).toBeVisible();
});
it("reports an unloaded overview without blaming the provider", () => {
  const results = { ...fullResults({ aiOverview: true }), aiOverviewContentLoaded: false };
  render(
    <RetrievedResultsOneCheck
      results={results}
      rankingUrl={null}
      retentionDays={null}
      formatDate={(date) => date}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "AI overview details" }));
  expect(
    screen.getByText("An AI overview was recorded, but its text was not saved."),
  ).toBeVisible();
  expect(screen.queryByText(/provider does not report/)).toBeNull();
});

it("does not label incomplete organic coverage as a no-match", () => {
  render(
    <RetrievedResultsOneCheck
      results={fullResults({ trackedPosition: null, observationCompleteness: "unknown" })}
      rankingUrl={null}
      retentionDays={null}
      formatDate={(value) => value}
    />,
  );
  expect(screen.getByText("Rank indeterminate: requested depth not covered")).toBeVisible();
  expect(screen.queryByText("not found")).toBeNull();
});

it("renders trailing missing slots as rows with only rank numbering", () => {
  const results = fullResults({
    requestedDepth: 20,
    retrievedPositions: 19,
    stoppedAtResult: false,
  });
  results.rows = results.rows.filter((row) => row.position <= 19);
  render(<RetrievedResultsLadder results={results} />);
  const ladder = screen.getByRole("list");
  expect(within(ladder).getByText("#20 not returned by the provider")).toBeVisible();
  expect(within(ladder).getAllByRole("listitem")).toHaveLength(20);
  expect(ladder.tagName).toBe("UL");
});
it("renders an empty retained range inline", () => {
  render(
    <RetrievedResultsLadder
      results={fullResults({
        rows: [],
        requestedDepth: 10,
        retrievedPositions: 0,
        stoppedAtResult: false,
      })}
    />,
  );
  expect(screen.getAllByRole("listitem")).toHaveLength(10);
  expect(screen.getByText("#10 not returned by the provider")).toBeVisible();
});
it("keeps intentional stop slots distinct from provider non-return", () => {
  const results = fullResults({ requestedDepth: 20, retrievedPositions: 3, stoppedAtResult: true });
  results.rows = results.rows.filter((row) => row.position <= 3);
  render(<RetrievedResultsLadder results={results} />);
  expect(screen.getByText("#20 not fetched after finding your domain")).toBeVisible();
  expect(screen.queryByText("#20 not returned by the provider")).toBeNull();
  expect(screen.getByText(/Stopped after finding your domain/)).toBeVisible();
});
it.each([
  { start: 10, precedingOrganicCount: 9 },
  { start: 30, precedingOrganicCount: 19 },
])(
  "preserves continuous organic ranks after short pages at offset $start",
  ({ start, precedingOrganicCount }) => {
    const firstRank = precedingOrganicCount + 1;
    const rows = [
      {
        position: firstRank,
        domain: "example.com",
        title: "Tracked extension result",
        url: "https://example.com/tracked",
        tracked: true,
      },
      {
        position: firstRank + 1,
        domain: "example.org",
        title: "Second extension result",
        url: "https://example.org/second",
        tracked: false,
      },
    ];
    const results = fullResults({
      rows: fullResults().rows.slice(0, precedingOrganicCount),
      retrievedPositions: precedingOrganicCount,
      requestedDepth: start,
      trackedPosition: null,
      stoppedAtResult: false,
      extension: {
        reason: "available",
        expiresAt: null,
        nextStart: start + 10,
        pages: [{ start, fetchedAt: "2026-11-04T10:00:00Z", skippedDuplicates: 0, rows }],
      },
    });
    render(
      <SnapshotExtensionResults
        results={results}
        competitors={[]}
        formatDateTime={(value) => value}
      />,
    );
    const list = screen.getByRole("list");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(start + 10 - firstRank + 1);
    expect(items[0]).toHaveAttribute("data-tracked", "true");
    expect(within(items[0]).getByText(`#${firstRank}`)).toBeVisible();
    expect(within(items[0]).getByText("Your site")).toBeVisible();
    expect(within(items[1]).getByText(`#${firstRank + 1}`)).toBeVisible();
    for (const row of rows)
      expect(within(list).getByRole("link", { name: row.title })).toHaveAttribute("href", row.url);
    expect(within(list).getByText(`#${start + 10} has no stored result`)).toBeVisible();
    expect(within(list).queryByText(`#${firstRank - 1} has no stored result`)).toBeNull();
    expect(list).not.toHaveTextContent("not returned by the provider");
    expect(screen.getByText(/2 added.*0 duplicates skipped/)).toBeVisible();
  },
);
it("does not trim leading or trailing slots to the stored extension rows", () => {
  const results = fullResults({
    extension: {
      reason: "available",
      expiresAt: null,
      nextStart: 20,
      pages: [
        {
          start: 10,
          fetchedAt: "2026-11-04T10:00:00Z",
          skippedDuplicates: 0,
          rows: fullResults().rows.filter((row) => row.position === 12 || row.position === 13),
        },
      ],
    },
  });
  render(
    <SnapshotExtensionResults
      results={results}
      competitors={[]}
      formatDateTime={(value) => value}
    />,
  );
  const list = screen.getByRole("list");
  expect(within(list).getAllByRole("listitem")).toHaveLength(10);
  expect(within(list).getByText("#11 has no stored result")).toBeVisible();
  expect(within(list).getByText("#20 has no stored result")).toBeVisible();
  expect(within(list).queryByText("#10 has no stored result")).toBeNull();
  expect(within(list).getAllByRole("link")).toHaveLength(2);
});
it("uses neutral stored-data wording for extension dedup gaps and includes the tail", () => {
  const result = (rank: number, path: string) => ({
    rank,
    url: `https://example.org/${path}`,
    domain: "example.org",
    title: path,
  });
  const merged = mergeSnapshotPage(
    [result(1, "original")],
    [result(21, "original"), result(22, "second"), result(23, "original"), result(24, "fourth")],
  );
  const results = fullResults({
    extension: {
      reason: "available",
      expiresAt: null,
      nextStart: 30,
      pages: [
        {
          start: 20,
          fetchedAt: "2026-11-04T10:00:00Z",
          skippedDuplicates: merged.skippedDuplicates,
          rows: merged.rows.map((row) => ({
            ...row,
            domain: new URL(row.url).hostname,
            position: row.rank,
            tracked: false,
          })),
        },
      ],
    },
  });
  render(
    <SnapshotExtensionResults
      results={results}
      competitors={[]}
      formatDateTime={(value) => value}
    />,
  );
  const list = screen.getByRole("list");
  expect(within(list).getByText("#21 has no stored result")).toBeVisible();
  expect(within(list).getByText("#23 has no stored result")).toBeVisible();
  expect(within(list).getByText("#30 has no stored result")).toBeVisible();
  expect(list).not.toHaveTextContent("not returned by the provider");
  expect(screen.getByText(/2 added.*2 duplicates skipped/)).toBeVisible();
  expect(within(list).getAllByRole("listitem")).toHaveLength(10);
});
it("renders an empty extension range without inventing provider gaps", () => {
  const results = fullResults({
    extension: {
      reason: "available",
      expiresAt: null,
      nextStart: 30,
      pages: [{ start: 20, fetchedAt: "2026-11-04T10:00:00Z", skippedDuplicates: 10, rows: [] }],
    },
  });
  render(
    <SnapshotExtensionResults
      results={results}
      competitors={[]}
      formatDateTime={(value) => value}
    />,
  );
  expect(screen.getAllByRole("listitem")).toHaveLength(10);
  expect(screen.getByText("#30 has no stored result")).toBeVisible();
  expect(screen.queryByText(/not returned by the provider/)).toBeNull();
});
