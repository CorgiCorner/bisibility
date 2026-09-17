import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import {
  renderWithOnboardingMessages as render,
  renderWithFeatureMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import type { RankedKeywordsSuccess } from "@/lib/ranked-keywords/service";
import onboardingMessages from "@/messages/core/en/onboarding.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useTranslations } from "next-intl";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { KeywordRankedImport } from "./KeywordRankedImport";
import { rankedImportMessages } from "./keyword-import-messages";

const connection = {
  id: "conn_a00000000000000000000000",
  label: "DataForSEO",
  provider: "dataforseo",
};

function LocalizedRankedImport(
  props: Omit<ComponentProps<typeof KeywordRankedImport>, "messages">,
) {
  const t = useTranslations("onboarding.keywords");
  return <KeywordRankedImport {...props} messages={rankedImportMessages(t)} />;
}

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
    cpcCents: null,
    difficulty: null,
    estimatedTraffic,
    intent: null,
    keyword,
    position: 4,
    rankAbsoluteDelta: null,
    rankAbsolute: null,
    rankingUrl: null,
    searchVolume: 100,
    serpFeatures: [],
  };
}

function renderCard(
  fetchAction: NonNullable<Parameters<typeof KeywordRankedImport>[0]["fetchAction"]> = vi.fn(
    async () => page([]),
  ),
  overrides: Partial<Omit<Parameters<typeof KeywordRankedImport>[0], "messages">> = {},
) {
  const onAppendQueries = vi.fn();
  render(
    <LocalizedRankedImport
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
      <LocalizedRankedImport
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
      <LocalizedRankedImport
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

  it("uses numeric Polish USD clauses for page cost, session spend, and cache state", async () => {
    const messages = mergeMessageCatalogs(sharedMessages, {
      onboarding: {
        ...onboardingMessages.onboarding,
        keywords: {
          ...onboardingMessages.onboarding.keywords,
          ranked: {
            ...onboardingMessages.onboarding.keywords.ranked,
            aboutPage: "(ok. {cost, number, ::currency/USD}/strona)",
            spent:
              "Wydano w sesji: {cost, number, ::currency/USD}{cached, select, yes {. Strona {page, number} z cache.} other {}}",
          },
        },
      },
    });
    renderWithFeatureMessages(
      <LocalizedRankedImport
        connections={[connection]}
        currentKeywords=""
        domain="example.com"
        fetchAction={vi.fn(async () => page([row("alpha", 10)], { cached: true, costCents: 2 }))}
        onAppendQueries={vi.fn()}
        projectId="prj_1"
      />,
      { locale: "pl", messages },
    );

    const action = screen.getByRole("button", {
      name: /Import from DataForSEO \(ok\. 0,02\sUSD\/strona\)/,
    });
    fireEvent.click(action);

    expect(await screen.findByText(/Wydano w sesji: 0,00\sUSD\. Strona 1 z cache\./)).toBeVisible();
    expect(screen.getByRole("button", { name: "Add 1 keyword" })).toBeEnabled();
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
