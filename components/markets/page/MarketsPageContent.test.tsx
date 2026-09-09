import type { NewMarketCreateResult } from "@/lib/markets/create-input";
import type { ArchivedProjectMarketsView, ProjectMarketsView } from "@/lib/queries/project-markets";
import { routerMock, setNavigationState } from "@/tests/next-navigation";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MarketsPageContent } from "./MarketsPageContent";

const mocks = vi.hoisted(() => ({
  drawerProps: undefined as
    | {
        initialDevices?: readonly ("desktop" | "mobile")[];
        initialMarketKeys?: readonly string[];
        open: boolean;
        projectId: string;
      }
    | undefined,
  newSheetProps: undefined as { onClose: () => void; open: boolean } | undefined,
}));

vi.mock("@/components/keywords/add/AddKeywordDrawer", () => ({
  AddKeywordDrawer: (props: {
    initialDevices?: readonly ("desktop" | "mobile")[];
    initialMarketKeys?: readonly string[];
    open: boolean;
    projectId: string;
  }) => {
    mocks.drawerProps = props;
    return props.open ? <div data-testid="keyword-drawer" /> : null;
  },
}));
vi.mock("@/components/markets/sheet/NewMarketSheet", () => ({
  NewMarketSheet: (props: { onClose: () => void; open: boolean }) => {
    mocks.newSheetProps = props;
    return props.open ? (
      <section data-testid="new-market-sheet">
        <button onClick={props.onClose} type="button">
          Close new market
        </button>
      </section>
    ) : null;
  },
}));
vi.mock("./MarketEditSheet", () => ({ MarketEditSheet: () => null }));
vi.mock("./MarketsTable", () => ({
  MarketsTable: ({
    onArchive,
    onAddKeywords,
    onStatusChange,
    onStatusConfirmed,
    rows,
    title,
  }: {
    onArchive: (market: (typeof rows)[number]) => void;
    onAddKeywords?: (market: (typeof rows)[number]) => void;
    onStatusChange: (input: { enabled: boolean; marketId: string }) => Promise<{ status: string }>;
    onStatusConfirmed?: () => void;
    rows: { id: string; name: string }[];
    title: string;
  }) => (
    <section aria-label={title}>
      {rows.map((market) => (
        <div key={market.id}>
          <span>{market.name}</span>
          <button
            onClick={() => {
              void onStatusChange({ enabled: false, marketId: market.id }).then(() =>
                onStatusConfirmed?.(),
              );
            }}
            type="button"
          >
            Pause {market.name}
          </button>
          {onAddKeywords ? (
            <button onClick={() => onAddKeywords(market)} type="button">
              Add keywords for {market.name}
            </button>
          ) : null}
          <button onClick={() => onArchive(market)} type="button">
            Archive {market.name}
          </button>
        </div>
      ))}
    </section>
  ),
}));

const activeMarket = {
  activeKeywordCount: 2,
  canonicalKey: "ES@es",
  countryCode: "ES",
  currentVisibility: 50,
  displayName: "Malaga",
  futureKeywordDevices: ["desktop", "mobile"] as ("desktop" | "mobile")[],
  id: "pmkt_abcdefghijklmnopqrstuvwx",
  keywordCount: 2,
  languageCode: "es",
  languageLabel: "Spanish",
  locationId: "location_malaga",
  monthlyCostCents: 515,
  name: "Malaga core",
  researchAvailable: true,
  status: "active" as const,
  topThreeCount: 1,
} satisfies ProjectMarketsView["markets"][number];

const pausedMarket = {
  ...activeMarket,
  id: "pmkt_bbcdefghijklmnopqrstuvwx",
  name: "Seville",
  status: "paused" as const,
} satisfies ProjectMarketsView["markets"][number];

function renderPage(
  markets: ProjectMarketsView["markets"] = [activeMarket, pausedMarket],
  archivedMarkets: ArchivedProjectMarketsView = {
    markets: [],
    projectId: "prj_abcdefghijklmnopqrstuvwx",
  },
  actions: {
    canCreateMarket?: boolean;
    createMarketAction?: (input: unknown) => Promise<NewMarketCreateResult>;
    onArchive?: (input: { marketId: string; projectId: string }) => Promise<unknown>;
    onRestore?: (input: { marketId: string; projectId: string }) => Promise<unknown>;
    openNewMarket?: boolean;
  } = {},
) {
  const onArchive = actions.onArchive ?? vi.fn(async () => undefined);
  const onRestore = actions.onRestore ?? vi.fn(async () => undefined);
  const onStatusChange = vi.fn(async ({ enabled }: { enabled: boolean }) => ({
    status: enabled ? "active" : "paused",
  }));
  const page = (nextMarkets = markets) => (
    <MarketsPageContent
      addKeywordsAction={vi.fn(async () => ({ created: 0, keywords: [] }))}
      archivedMarkets={archivedMarkets}
      canAddKeywords
      canCreateMarket={actions.canCreateMarket}
      canArchive
      canEdit
      canRestore
      createMarketAction={actions.createMarketAction}
      markets={{
        markets: nextMarkets,
        maxMarkets: 5,
        monthlyCostCents: 515,
        perMarketChecks: 2,
        projectId: "prj_abcdefghijklmnopqrstuvwx",
      }}
      onArchive={onArchive}
      onRestore={onRestore}
      onSave={vi.fn(async () => undefined)}
      onStatusChange={onStatusChange}
      openNewMarket={actions.openNewMarket}
    />
  );
  const view = render(page());
  return {
    onArchive,
    onRestore,
    onStatusChange,
    rerenderMarkets: (next: typeof markets) => view.rerender(page(next)),
  };
}

describe("MarketsPageContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.drawerProps = undefined;
    mocks.newSheetProps = undefined;
  });

  it("keeps exactly one table per group through repeated pause and resume updates", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerenderMarkets } = renderPage([activeMarket]);
    try {
      for (const status of ["paused", "active", "paused", "active", "paused"] as const) {
        rerenderMarkets([{ ...activeMarket, status }]);
        expect(screen.getAllByRole("region", { name: "Active markets" })).toHaveLength(1);
        expect(screen.queryAllByRole("region", { name: "Paused markets" })).toHaveLength(
          status === "paused" ? 1 : 0,
        );
        expect(screen.getAllByText(activeMarket.name)).toHaveLength(1);
      }
      expect(
        error.mock.calls.some((call) => call.some((value) => String(value).includes("same key"))),
      ).toBe(false);
    } finally {
      error.mockRestore();
    }
  });

  it("does not claim archived keyword history is being archived again", async () => {
    renderPage([{ ...activeMarket, activeKeywordCount: 0, keywordCount: 10 }]);
    fireEvent.click(screen.getByRole("button", { name: "Archive Malaga core" }));
    expect(
      await screen.findByText(
        "Malaga core will be archived. Existing rank history stays readable.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/10 keywords will be archived/)).not.toBeInTheDocument();
  });

  it("refreshes the server groups after a confirmed status change", async () => {
    const { onStatusChange } = renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Pause Malaga core" }));

    await waitFor(() => expect(onStatusChange).toHaveBeenCalledOnce());
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalledOnce());
  });

  it("opens the existing drawer with the selected market defaults", () => {
    renderPage([{ ...activeMarket, futureKeywordDevices: ["mobile"] }]);

    fireEvent.click(screen.getByRole("button", { name: "Add keywords for Malaga core" }));

    expect(screen.getByTestId("keyword-drawer")).toBeInTheDocument();
    expect(mocks.drawerProps).toMatchObject({
      initialDevices: ["mobile"],
      initialMarketKeys: ["ES@es"],
      open: true,
      projectId: "prj_abcdefghijklmnopqrstuvwx",
    });
  });

  it("uses the shared empty state for normal and archived views", () => {
    renderPage([]);

    expect(screen.getByRole("tab", { name: "Active and paused" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    expect(screen.getByRole("heading", { name: "Track your first market" })).toBeInTheDocument();
    expect(
      screen.getByText("Create a market to organize keyword tracking by location and language."),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "New market" })).toEqual(
      expect.arrayContaining([expect.objectContaining({ disabled: true })]),
    );
    expect(document.querySelector("[data-new-market-seam='b2']")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("tab", { name: "Active and paused" }), {
      key: "ArrowRight",
    });
    expect(screen.getByRole("tab", { name: "Archived" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Archived" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Archived" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No archived markets" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Archived markets appear here. Restore one when you are ready to resume its schedules.",
      ),
    ).toBeInTheDocument();
  });

  it("hands the header action to the page-owned route intent", async () => {
    const user = userEvent.setup();
    setNavigationState({ pathname: "/app/prj_abcdefghijklmnopqrstuvwx/markets" });
    renderPage([], undefined, { canCreateMarket: true });

    const [headerAction] = screen.getAllByRole("button", { name: "New market" });
    if (!headerAction) throw new Error("Expected the Markets header action.");
    await user.click(headerAction);

    expect(routerMock.push).toHaveBeenCalledWith(
      "/app/prj_abcdefghijklmnopqrstuvwx/markets?new-market=1",
    );
  });

  it("renders one route-owned sheet and clears that intent on close", async () => {
    const user = userEvent.setup();
    setNavigationState({ pathname: "/app/prj_abcdefghijklmnopqrstuvwx/markets" });
    renderPage([], undefined, {
      canCreateMarket: true,
      createMarketAction: vi.fn(async () => ({
        canonicalKey: activeMarket.canonicalKey,
        countryCode: activeMarket.countryCode,
        displayName: activeMarket.displayName,
        keywordCount: 0,
        kind: "country" as const,
        languageCode: activeMarket.languageCode,
        languageLabel: activeMarket.languageLabel,
        publicId: activeMarket.id,
      })),
      openNewMarket: true,
    });

    expect(screen.getAllByTestId("new-market-sheet")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Close new market" }));
    expect(routerMock.replace).toHaveBeenCalledWith("/app/prj_abcdefghijklmnopqrstuvwx/markets");
  });

  it("returns a restored market to the server-managed normal groups", async () => {
    const { onRestore } = renderPage([], {
      markets: [activeMarket],
      projectId: "prj_abcdefghijklmnopqrstuvwx",
    });

    fireEvent.click(screen.getByRole("tab", { name: "Archived" }));
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    fireEvent.click(await screen.findByRole("button", { name: "Restore market" }));

    await waitFor(() => expect(onRestore).toHaveBeenCalledOnce());
    expect(routerMock.refresh).toHaveBeenCalledOnce();
  });

  it("clears an archive error before opening a different market", async () => {
    const onArchive = vi.fn().mockRejectedValueOnce(new Error("network"));
    renderPage([activeMarket, { ...pausedMarket, status: "active" }], undefined, { onArchive });

    fireEvent.click(screen.getByRole("button", { name: "Archive Malaga core" }));
    fireEvent.click(await screen.findByRole("button", { name: "Archive market" }));
    expect(await screen.findByText("Market could not be archived. Try again.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Archive Seville" }));

    expect(await screen.findByRole("heading", { name: "Archive Seville?" })).toBeInTheDocument();
    expect(screen.queryByText("Market could not be archived. Try again.")).not.toBeInTheDocument();
  });

  it("clears a restore error before opening a different market", async () => {
    const onRestore = vi.fn().mockRejectedValueOnce(new Error("network"));
    renderPage(
      [],
      {
        markets: [
          activeMarket,
          { ...activeMarket, id: "pmkt_ccdefghijklmnopqrstuvwx", name: "Granada" },
        ],
        projectId: "prj_abcdefghijklmnopqrstuvwx",
      },
      { onRestore },
    );

    fireEvent.click(screen.getByRole("tab", { name: "Archived" }));
    const initialRestore = screen.getAllByRole("button", { name: "Restore" })[0];
    if (!initialRestore) throw new Error("Expected an archived market restore control.");
    fireEvent.click(initialRestore);
    fireEvent.click(await screen.findByRole("button", { name: "Restore market" }));
    expect(await screen.findByText("Market could not be restored. Try again.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const nextRestore = screen.getAllByRole("button", { name: "Restore" })[1];
    if (!nextRestore) throw new Error("Expected a second archived market restore control.");
    fireEvent.click(nextRestore);

    expect(await screen.findByRole("heading", { name: "Restore Granada?" })).toBeInTheDocument();
    expect(screen.queryByText("Market could not be restored. Try again.")).not.toBeInTheDocument();
  });
});
