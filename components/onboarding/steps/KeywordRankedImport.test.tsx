import type { RankedKeywordsSuccess } from "@/lib/ranked-keywords/service";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KeywordRankedImport } from "./KeywordRankedImport";

const connection = {
  id: "conn_a00000000000000000000000",
  label: "DataForSEO",
  provider: "dataforseo",
};

function page(
  rows: RankedKeywordsSuccess["rows"],
  overrides: Partial<RankedKeywordsSuccess> = {},
): RankedKeywordsSuccess {
  return {
    cached: false,
    connections: [connection],
    costCents: 2,
    fetchedAt: "2026-07-22T10:00:00.000Z",
    offset: 0,
    rows,
    totalCount: rows.length,
    ...overrides,
  };
}

function row(keyword: string, estimatedTraffic: number, alreadyTracked = false) {
  return {
    alreadyTracked,
    estimatedTraffic,
    keyword,
    position: 4,
    searchVolume: 100,
  };
}

function renderCard(
  fetchAction: NonNullable<Parameters<typeof KeywordRankedImport>[0]["fetchAction"]> = vi.fn(
    async () => page([]),
  ),
  overrides: Partial<Parameters<typeof KeywordRankedImport>[0]> = {},
) {
  const onAppendQueries = vi.fn();
  render(
    <KeywordRankedImport
      connections={[connection]}
      currentKeywords=""
      domain="example.com"
      fetchAction={fetchAction}
      onAppendQueries={onAppendQueries}
      projectId="prj_1"
      {...overrides}
    />,
  );
  return { fetchAction, onAppendQueries };
}

describe("KeywordRankedImport", () => {
  it("keeps space between the account note and import action", () => {
    renderCard();

    const action = screen.getByRole("button", { name: /Import from DataForSEO/ });
    expect(action.parentElement).toHaveClass("mt-3");
  });
  it("is hidden without capability and never requests before opt-in", () => {
    const fetchAction = vi.fn();
    const { rerender } = render(
      <KeywordRankedImport
        connections={[]}
        currentKeywords=""
        domain="example.com"
        fetchAction={fetchAction}
        onAppendQueries={vi.fn()}
        projectId="prj_1"
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Import from DataForSEO/ }),
    ).not.toBeInTheDocument();
    rerender(
      <KeywordRankedImport
        connections={[connection]}
        currentKeywords=""
        domain="example.com"
        fetchAction={fetchAction}
        onAppendQueries={vi.fn()}
        projectId="prj_1"
      />,
    );
    expect(
      screen.getByRole("button", { name: "Import from DataForSEO (about $0.02/page)" }),
    ).toBeInTheDocument();
    expect(fetchAction).not.toHaveBeenCalled();
  });

  it("hides money copy when the selected provider has no ranked-keyword rate", () => {
    renderCard(undefined, {
      connections: [
        {
          id: "conn_b00000000000000000000000",
          label: "Future provider",
          provider: "future",
        },
      ],
    });

    expect(screen.queryByText(/about \$/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import from DataForSEO" })).toBeInTheDocument();
  });

  it("groups variants, disables tracked rows, and preselects within remaining capacity", async () => {
    renderCard(
      vi.fn(async () =>
        page([
          row("seo-api", 2),
          row("SEO api", 10),
          row("already here", 8, true),
          row("new keyword", 7),
        ]),
      ),
      {
        currentKeywords: Array.from({ length: 499 }, (_, index) => `current ${index}`).join("\n"),
      },
    );
    fireEvent.click(screen.getByRole("button", { name: /Import from DataForSEO/ }));
    const table = await screen.findByRole("table", { name: "Ranked keyword suggestions" });
    expect(within(table).getByText("SEO api")).toBeInTheDocument();
    expect(within(table).getByText("+1 variants")).toBeInTheDocument();
    expect(within(table).getByText("Already tracked")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select already here" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add 1 keyword" })).toBeInTheDocument();
  });

  it("appends later pages without dropping selection and excludes later rows from preselect", async () => {
    const fetchAction = vi
      .fn()
      .mockResolvedValueOnce(page([row("first", 10)], { totalCount: 2 }))
      .mockResolvedValueOnce(
        page([row("second", 9)], { cached: true, offset: 100, totalCount: 2 }),
      );
    const { onAppendQueries } = renderCard(fetchAction);
    fireEvent.click(screen.getByRole("button", { name: /Import from DataForSEO/ }));
    await screen.findByText("first");
    expect(screen.getByText("1 of 1 selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Load next 100/ }));
    await screen.findByText("second");
    expect(screen.getByText("1 of 2 selected")).toBeInTheDocument();
    expect(screen.getByText(/Spent this session: \$0.02. Page 2 cached./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add 1 keyword" }));
    expect(onAppendQueries).toHaveBeenCalledWith(["first"]);
  });

  it("keeps loaded data and selection when load-next fails", async () => {
    const fetchAction = vi
      .fn()
      .mockResolvedValueOnce(page([row("first", 10)], { totalCount: 2 }))
      .mockRejectedValueOnce(new Error("network"));
    renderCard(fetchAction);
    fireEvent.click(screen.getByRole("button", { name: /Import from DataForSEO/ }));
    await screen.findByText("first");
    fireEvent.click(screen.getByRole("button", { name: /Load next 100/ }));
    expect(await screen.findByText("Ranked-keyword lookup failed. Try again.")).toBeInTheDocument();
    expect(screen.getByText("first")).toBeInTheDocument();
    expect(screen.getByText("1 of 1 selected")).toBeInTheDocument();
  });

  it("does not offer an offset beyond the API cap", async () => {
    renderCard(vi.fn(async () => page([row("last page", 1)], { offset: 900, totalCount: 2_000 })));
    fireEvent.click(screen.getByRole("button", { name: /Import from DataForSEO/ }));
    await screen.findByText("last page");
    expect(screen.queryByRole("button", { name: /Load next 100/ })).not.toBeInTheDocument();
  });

  it("dedupes current textarea content before appending", async () => {
    const { onAppendQueries } = renderCard(
      vi.fn(async () => page([row("rank-tracker", 10), row("new", 9)])),
      { currentKeywords: "Rank tracker" },
    );
    fireEvent.click(screen.getByRole("button", { name: /Import from DataForSEO/ }));
    await screen.findByText("rank-tracker");
    expect(screen.getByRole("checkbox", { name: "Select rank-tracker" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Add 1 keyword" }));
    expect(onAppendQueries).toHaveBeenCalledWith(["new"]);
  });

  it.each([
    ["needs_reauth", "DataForSEO authorization has expired."],
    ["rate_limited", "Provider rate limit reached. Try again shortly."],
    ["budget_exhausted", "Monthly rank-check budget reached."],
    ["unsupported_location", "Ranked-keyword lookup is not available"],
    ["no_source", "No eligible DataForSEO connection is available."],
    ["no_domain", "Add a valid project domain"],
  ] as const)("renders the %s outcome", async (reason, message) => {
    renderCard(vi.fn(async () => ({ reason })));
    fireEvent.click(screen.getByRole("button", { name: /Import from DataForSEO/ }));
    await waitFor(() => expect(screen.getByText(message, { exact: false })).toBeInTheDocument());
  });
});
