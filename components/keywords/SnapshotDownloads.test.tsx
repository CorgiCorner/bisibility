import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { downloadTextFile } from "@/lib/ui/download";
import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { fullResults } from "./retrieved-results-test-fixtures";
import { SnapshotDownloads } from "./SnapshotDownloads";

vi.mock("@/lib/ui/download", () => ({ downloadTextFile: vi.fn() }));
it("downloads CSV and normalized JSON directly from the displayed data", () => {
  const results = fullResults();
  render(
    <SnapshotDownloads
      results={results}
      keyword={{
        keyword: "Example keyword",
        device: "mobile",
        location: {
          id: "Spain",
          displayName: "Spain",
          canonicalKey: "country:es@es",
          countryCode: "ES",
          cityName: null,
          kind: "country",
          gl: "es",
          hl: "es",
        },
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Download CSV" }));
  expect(downloadTextFile).toHaveBeenLastCalledWith(
    expect.stringContaining("rank,title,url,domain,result_type,resolution_status"),
    "Example-keyword-Spain-mobile-2026-08-02.csv",
    "text/csv;charset=utf-8",
  );
  fireEvent.click(screen.getByRole("button", { name: "Download JSON" }));
  expect(downloadTextFile).toHaveBeenLastCalledWith(
    expect.stringContaining('"organicResults"'),
    "Example-keyword-Spain-mobile-2026-08-02.json",
    "application/json;charset=utf-8",
  );
  expect(screen.getByText(/Stored normalized data/)).toBeVisible();
});
