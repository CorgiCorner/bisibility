import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { ProjectWriteModeProvider } from "@/components/shell/ProjectWriteModeProvider";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { MarketScope } from "@/lib/markets/market-scope";
import type { KeywordRow } from "@/lib/queries/keywords";
import rankTrackerMessages from "@/messages/core/en/project-rank-tracker.json";
import keywordImportMessages from "@/messages/core/en/project-rank-tracker-keyword-import.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { fireEvent, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { BulkActionBar } from "./BulkActionBar";

const actions = {
  bulkClearTargetAction: vi.fn(async () => undefined),
  bulkDeleteAction: vi.fn(async () => undefined),
  bulkSetTargetAction: vi.fn(async () => undefined),
  bulkTagAction: vi.fn(async () => undefined),
};
const base = keywordRows[0] as KeywordRow;
const germanMarket: MarketScope = {
  canonicalKey: "DE",
  label: "Germany / German",
  ref: "pmkt_de",
};

function rowIn(id: string, canonicalKey: string): KeywordRow {
  return {
    ...base,
    id,
    location: { ...base.location, canonicalKey, id: canonicalKey },
    schedule: { ...base.schedule, serp_depth: 20 },
  };
}

const inMarket = rowIn("kw_de", "DE");
const outsideMarket = rowIn("kw_us", "US");

function renderBar(
  selectedRows: KeywordRow[],
  marketScope: MarketScope | null,
  onRunChecks = vi.fn(),
) {
  render(
    <BulkActionBar
      {...actions}
      canDeleteKeyword
      canUpdateKeyword
      marketScope={marketScope}
      onClear={vi.fn()}
      onRunChecks={onRunChecks}
      projectId="prj_1"
      selectedRows={selectedRows}
    />,
  );
  return onRunChecks;
}

function renderPolish(children: ReactNode) {
  const messages = {
    ...keywordImportMessages,
    projectRankTracker: {
      ...keywordImportMessages.projectRankTracker,
      keywordImport: {
        ...keywordImportMessages.projectRankTracker.keywordImport,
        management: {
          ...keywordImportMessages.projectRankTracker.keywordImport.management,
          runChecks: {
            ...keywordImportMessages.projectRankTracker.keywordImport.management.runChecks,
            actionWithDepth: "{action} ({depth})",
            changeDefault: "Zmień domyślne",
            chooseDepth: "Wybierz głębokość",
            connectProvider: "Połącz dostawcę SERP",
            depthMenu: "Głębokość sprawdzenia",
            keywordDefaults: "ustawienia słów",
            runAllMarkets: "Sprawdź we wszystkich rynkach",
            runCheck: "Sprawdź pozycję",
            runCheckInMarket: "Sprawdź w {market}",
            runChecks: "Sprawdź pozycje",
            runChecksInMarket: "Sprawdź w {market}",
            shallowVisibility:
              "Sprawdzenia do 10 nie aktualizują widoczności. Dotknięte słowa nadal liczą się do pokrycia.",
            starting: "Uruchamianie...",
            top: "Pierwsze {depth, number}",
          },
        },
      },
    },
  };
  return render(
    <FeatureMessagesProvider
      locale="pl"
      messages={mergeMessageCatalogs(sharedMessages, rankTrackerMessages, messages)}
      timeZone="UTC"
    >
      <ProjectWriteModeProvider projectRef="prj_1" writeMode="active">
        {children}
      </ProjectWriteModeProvider>
    </FeatureMessagesProvider>,
  );
}

describe("BulkActionBar inside one market", () => {
  it("names the market the selection spends in and spends only there", () => {
    const onRunChecks = renderBar([inMarket, outsideMarket], germanMarket);

    fireEvent.click(screen.getByRole("button", { name: "Run check in Germany / German (Top 20)" }));

    expect(onRunChecks).toHaveBeenLastCalledWith(["kw_de"]);
  });

  it("puts the cross-market run on its own quieter control", () => {
    const onRunChecks = renderBar([inMarket, outsideMarket], germanMarket);

    const crossMarket = screen.getByRole("button", { name: "Run checks in all markets" });
    expect(crossMarket).toHaveAttribute("data-variant", "ghost");
    expect(crossMarket).not.toHaveAttribute("data-variant", "primary");

    fireEvent.click(crossMarket);
    expect(onRunChecks).toHaveBeenLastCalledWith(["kw_de", "kw_us"]);
  });

  it("offers no cross-market control when the selection never leaves the market", () => {
    renderBar([inMarket], germanMarket);

    expect(
      screen.queryByRole("button", { name: "Run checks in all markets" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Run check in Germany / German (Top 20)" }),
    ).toBeInTheDocument();
  });

  it("drops the in-market button when nothing selected belongs to this market", () => {
    const onRunChecks = renderBar([outsideMarket], germanMarket);

    expect(screen.queryByRole("button", { name: /^Run check in/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run checks in all markets" }));
    expect(onRunChecks).toHaveBeenLastCalledWith(["kw_us"]);
  });

  it("leaves the project level exactly as it was", () => {
    const onRunChecks = renderBar([inMarket, outsideMarket], null);

    expect(
      screen.queryByRole("button", { name: "Run checks in all markets" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /in Germany/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Run checks (Top 20)" }));
    expect(onRunChecks).toHaveBeenLastCalledWith(["kw_de", "kw_us"]);
  });

  it("uses injected non-English copy for the actual market list adapter", async () => {
    const onRunChecks = vi.fn();
    renderPolish(
      <BulkActionBar
        {...actions}
        canDeleteKeyword
        canUpdateKeyword
        marketScope={germanMarket}
        onClear={vi.fn()}
        onRunChecks={onRunChecks}
        projectId="prj_1"
        selectedRows={[
          { ...inMarket, schedule: { ...inMarket.schedule, serp_depth: 10 } },
          outsideMarket,
        ]}
      />,
    );

    const marketAction = screen.getByRole("button", {
      name: "Sprawdź w Germany / German (Pierwsze 10)",
    });
    fireEvent.click(marketAction);
    expect(onRunChecks).toHaveBeenLastCalledWith(["kw_de"]);
    fireEvent.click(screen.getByRole("button", { name: "Sprawdź we wszystkich rynkach" }));
    expect(onRunChecks).toHaveBeenLastCalledWith(["kw_de", "kw_us"]);

    fireEvent.click(screen.getByRole("button", { name: "Wybierz głębokość" }));
    expect(screen.getByRole("menu", { name: "Głębokość sprawdzenia" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Zmień domyślne" })).toHaveAttribute(
      "href",
      "/app/prj_1/settings/tracking",
    );
    expect(marketAction.closest("fieldset")).toHaveAccessibleDescription(
      "Sprawdzenia do 10 nie aktualizują widoczności. Dotknięte słowa nadal liczą się do pokrycia.",
    );
  });

  it("keeps mixed and pending selected-list states localized without dispatching a check", () => {
    const onRunChecks = vi.fn();
    renderPolish(
      <BulkActionBar
        {...actions}
        canDeleteKeyword
        canUpdateKeyword
        onClear={vi.fn()}
        onRunChecks={onRunChecks}
        projectId="prj_1"
        selectedRows={[
          { ...inMarket, schedule: { ...inMarket.schedule, serp_depth: 10 } },
          outsideMarket,
        ]}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Sprawdź pozycje (Pierwsze 10 / Pierwsze 20)" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Wybierz głębokość" }));
    expect(
      screen.getAllByRole("menuitem").every((item) => item.querySelector("svg") === null),
    ).toBe(true);
    expect(onRunChecks).not.toHaveBeenCalled();
  });

  it("keeps the localized pending adapter disabled for one selected keyword", () => {
    renderPolish(
      <BulkActionBar
        {...actions}
        canDeleteKeyword
        canUpdateKeyword
        checksRunning
        onClear={vi.fn()}
        onRunChecks={vi.fn()}
        projectId="prj_1"
        selectedRows={[inMarket]}
      />,
    );

    expect(screen.getByRole("button", { name: "Uruchamianie..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Wybierz głębokość" })).toBeDisabled();
  });

  it("keeps the disconnected list adapter localized and read-only", () => {
    renderPolish(
      <BulkActionBar
        {...actions}
        canDeleteKeyword
        canUpdateKeyword
        onClear={vi.fn()}
        onRunChecks={vi.fn()}
        projectId="prj_1"
        providerConnected={false}
        selectedRows={[inMarket]}
      />,
    );

    expect(screen.getByRole("link", { name: "Połącz dostawcę SERP" })).toHaveAttribute(
      "href",
      "/app/prj_1/integrations",
    );
    expect(screen.queryByRole("button", { name: "Wybierz głębokość" })).not.toBeInTheDocument();
  });
});
